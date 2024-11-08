import { useState, useEffect } from "react";
import { Form, Input, Table, Tag, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import {
  useAccounts,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schemas/2024.4";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import SelectTokenModal from "../../../components/SelectTokenModal";
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import DonutChart from "../../../components/DonutChart";
import LockInfoModal from "../../../components/LockInfoModal";
dayjs.extend(isBetween);

const gqlClient = new SuiGraphQLClient({
  url: "https://sui-testnet.mystenlabs.com/graphql",
});

// 状态到 Tag 的映射
const statusMap = {
  locked: { color: "red", text: "Locked" },
  cliffed: { color: "orange", text: "Cliffed" },
  releasing: { color: "blue", text: "Releasing" },
  finished: { color: "black", text: "finished" },
};

export default function VestManager() {
  const [coinAddress, setCoinAddress] = useState("");
  const [vestingLockList, setVestingLockList] = useState([]);
  const [selectMintCoin, setSelectMintCoin] = useState({});
  const [currentVesting, setCurrentVesting] = useState({});
  const [selectTokenModalVisible, setSelectTokenModalVisible] = useState(false);
  const [vestingInfoModalVisible, setVestingInfoModalVisible] = useState(false);
  const [form] = Form.useForm();

  const client = useSuiClient();
  const [account] = useAccounts();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const walletAddress = account?.address;

  useEffect(() => {
    fetchVestingSchedule();
  }, [walletAddress]);

  const { data: ownObjects } = useSuiClientQuery("getOwnedObjects", {
    owner: walletAddress ?? "",
    options: { showType: true },
    filter: {
      MoveModule: {
        package: "0x2",
        module: "coin",
      },
    },
  });

  const coinGroupData = groupByAddress(ownObjects);

  const getStatus = (data) => {
    const currentTime = Date.now(); // 获取当前时间的毫秒数
    const startTimestamp = parseInt(data.start_timestamp_ms, 10);
    const cliffTimestamp = parseInt(data.cliff_timestamp_ms, 10);
    const finalTimestamp = parseInt(data.final_timestamp_ms, 10);

    if (currentTime < startTimestamp) {
      return "locked"; // 当前时间在 start_timestamp_ms 之前
    } else if (currentTime >= startTimestamp && currentTime < cliffTimestamp) {
      return "cliffed"; // 当前时间在 start_timestamp_ms 和 cliff_timestamp_ms 之间
    } else if (currentTime >= cliffTimestamp && currentTime < finalTimestamp) {
      return "releasing"; // 当前时间在 cliff_timestamp_ms 和 final_timestamp_ms 之间
    } else {
      return "finished"; // 当前时间在 final_timestamp_ms 之后
    }
  };

  const calculateLockDuration = (startTimestamp, endTimestamp) => {
    const start = dayjs(parseInt(startTimestamp, 10));
    const end = dayjs(parseInt(endTimestamp, 10));

    const months = end.diff(start, "month"); // 计算月数
    const days = end.diff(start, "day"); // 计算天数
    const hours = end.diff(start, "hour"); // 计算小时

    // 根据条件返回相应的结果
    if (months > 0) {
      return `${months} months`;
    } else if (days > 0) {
      return `${days} days`;
    } else if (hours > 0) {
      return `${hours} hours`;
    } else {
      return "< hour"; // 如果时间差小于一小时
    }
  };

  const { data: ownObjects1 } = useSuiClientQuery(
    "multiGetObjects",
    {
      ids: [selectMintCoin?.address],
      options: { showType: true, showContent: true },
    },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );

  const vestingSchedules =
    ownObjects1?.map((item) => {
      const temp = item.data?.content?.fields;
      const { start_timestamp_ms, cliff_timestamp_ms } = temp || {};
      const status = getStatus(temp);
      return {
        ...temp,
        status,
        symbol: temp?.coin_type?.split("::")?.[2],
        lockupDuration: calculateLockDuration(
          start_timestamp_ms,
          cliff_timestamp_ms
        ),
      };
    })
    .filter((schedule) => schedule?.description?.includes("locker")) || [];


  const handleInfoClick = (data) => {
    setVestingInfoModalVisible(true);
    setCurrentVesting(data);
  };

  // 取消锁定
  const handleRefoundLock = async () => {
    const tx = new Transaction();

    tx.setGasBudget(100000000);

    // const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(supply)]);
    const { coin_type, id } = currentVesting || {};
    tx.moveCall({
      target:
        "0x1cb16f568d8bfd055ba2d692d3c110bc8a7d4b7841b28c4f39e05e6f39b385ff::vesting_lock::refund_locker",
      typeArguments: [coin_type],
      arguments: [tx.object(id?.id)],
    });

    // Dry run
    tx.setSender(account.address);
    const dryRunRes = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    if (dryRunRes.effects.status.status === "failure") {
      message.error(dryRunRes.effects.status.error);
      return;
    }

    // // Execute
    signAndExecuteTransaction(
      {
        transaction: tx,
      },
      {
        onSuccess: async (txRes) => {
          const finalRes = await client.waitForTransaction({
            digest: txRes.digest,
            options: {
              showEffects: true,
            },
          });

          message.success("Tx Success!");
          setVestingInfoModalVisible(false);
        },
        onError: (err) => {
          message.error(err.message);
        },
      }
    );
  };

  const fetchVestingSchedule = async () => {
    if (!walletAddress) return;
    const chainIdentifierQuery = graphql(`
      query ByTxSender {
        events(
          first: 50
          filter: {
            sender: "${walletAddress}"
          eventType:"0x1cb16f568d8bfd055ba2d692d3c110bc8a7d4b7841b28c4f39e05e6f39b385ff::vesting_lock::NewLocker"
          }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            sendingModule {
              name
              
            }
            sender {
              address
            }
            contents {
              json
            }
            timestamp
          }
        }
      }
  `);
    const data = await gqlClient.query({
      query: chainIdentifierQuery,
    });
    const result =
      data?.data?.events?.nodes?.map((item) => {
        const { amount, lock_id, coin_type } = item?.contents?.json || {};
        const symbol = coin_type?.split("::")?.[2];
        return {
          amount,
          address: lock_id,
          symbol,
        };
      }) || [];
    setVestingLockList(result);
    const first = result?.[0];
    setSelectMintCoin(first);
    setCoinAddress(first?.address);
  };

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Original Balance",
      dataIndex: "original_balance",
      key: "original_balance",
      render: (text) => (
        <span>
          {text}
          {selectMintCoin?.symbol || ""}
        </span>
      ), // 格式化金额
    },
    {
      title: "Final Timestamp",
      dataIndex: "final_timestamp_ms",
      key: "final_timestamp_ms",
      render: (text) => dayjs(Number(text)).format("DD/MM/YYYY"), // 格式化时间戳
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (_text) => {
        const { color, text } = statusMap[_text]; // 根据状态获取颜色和文本
        return <Tag color={color}>{text}</Tag>; // 返回 Tag 组件
      },
    },
    {
      title: "Info",
      key: "info",
      render: (_, record) => (
        <div
          className="btn btn-primary text-sm"
          onClick={() => handleInfoClick(record)}
        >
          View
        </div>
      ), // 按钮处理信息
    },
  ];

  return (
    <div className="p-4">
      <div className="mb-4 p-4 bg-white">
        <h1 className="mb-2 text-[26px]">My locks Total</h1>
        <div className="mb-6 flex items-center">
          <div className="w-[100px] inline-block ml-4">My Token</div>
          <Input
            value={coinAddress}
            prefix={<SearchOutlined />}
            placeholder="please select"
            onClick={() => setSelectTokenModalVisible(true)}
            className="ml-2"
          />
        </div>
        <div className="flex items-center">
          <DonutChart data={[0, 100]} colors={["#8BCBF0", "#37298D"]} />
          <div className="min-w-[140px] ml-6">
            <div className="px-1 bg-[#a6a0d1] inline-block">Total</div>
            <br></br>
            {selectMintCoin?.amount || 0}&nbsp;{selectMintCoin?.symbol || "*"}
          </div>
          <div className="min-w-[180px]">
            <div className="px-1 bg-[#8BCBF0] inline-block">Locked</div>
            <br></br>
            {0}&nbsp;{selectMintCoin?.symbol || "*"}
          </div>
          <div className="min-w-[160px]">
            <div>Unlocked</div>
            {selectMintCoin?.amount || 0}&nbsp;{selectMintCoin?.symbol || "*"}
          </div>
        </div>
      </div>

      <div className="p-4 bg-white">
        <h1 className="mb-2 text-[26px]">Lock Schedule</h1>
        <Table
          dataSource={vestingSchedules}
          columns={columns}
          pagination={false}
        />
      </div>

      {/* 选择对话框 */}
      <SelectTokenModal
        visible={selectTokenModalVisible}
        data={vestingLockList}
        onClose={() => setSelectTokenModalVisible(false)}
        onSelect={(data) => {
          setSelectMintCoin(data);
          setCoinAddress(data.address);
          setSelectTokenModalVisible(false);
        }}
      />
      {/* 查看对话框 */}
      <LockInfoModal
        visible={vestingInfoModalVisible}
        data={currentVesting}
        onClose={() => setVestingInfoModalVisible(false)}
        onRefound={handleRefoundLock}
      />
    </div>
  );
}
