import { useState, useEffect, useRef } from "react";
import { Form, Input, Table, Tag, message, Divider } from "antd";
import {
  useSuiClient,
  useCurrentAccount,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schemas/2024.4";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import SelectTokenModal from "../../../components/SelectTokenModal";
import "./index.css";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import DonutChart from "../../../components/DonutChart";
import VestingInfoModal from "../../../components/VestingInfoModal";
dayjs.extend(isBetween);

// 状态到 Tag 的映射
const statusMap = {
  locked: { color: "red", text: "Locked" },
  cliffed: { color: "orange", text: "Cliffed" },
  releasing: { color: "blue", text: "Releasing" },
  finished: { color: "black", text: "finished" },
};

export default function VestManager() {
  const [searchValue, setSearchValue] = useState("");
  const [sureAddress, setSureAddress] = useState("");
  const [vestingSchedules, setVestingSchedules] = useState([]);
  const [dataSource, setDataSource] = useState([]); // claim历史记录
  const [currentClaim, setCurrentClaim] = useState({});
  const [currentVesting, setCurrentVesting] = useState({});
  const [loading, setLoading] = useState(false);
  const [submiting, setSubmiting] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [vestingInfoModalVisible, setVestingInfoModalVisible] = useState(false);
  const [form] = Form.useForm();

  const searchRef = useRef();
  const client = useSuiClient();
  const currentAccount = useCurrentAccount();
  const walletAddress = currentAccount?.address;

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const gqlClient = new SuiGraphQLClient({
    url: "https://sui-testnet.mystenlabs.com/graphql",
  });

  useEffect(() => {
    fetchVestingHistory();
  }, [walletAddress]);

  const getStatus = (data) => {
    const currentTime = Date.now(); // 获取当前时间的毫秒数
    const startTimestamp = parseInt(data?.start_timestamp_ms, 10);
    const cliffTimestamp = parseInt(data?.cliff_timestamp_ms, 10);
    const finalTimestamp = parseInt(data?.final_timestamp_ms, 10);

    if (currentTime < startTimestamp) {
      return "locked"; // 当前时间在 start_timestamp_ms 之前
    } else if (currentTime >= startTimestamp && currentTime < cliffTimestamp) {
      return "cliffed"; // 当前时间在 start_timestamp_ms 和 cliff_timestamp_ms 之间
    } else if (currentTime >= cliffTimestamp && currentTime < finalTimestamp) {
      return "releasing"; // 当前时间在 cliff_timestamp_ms 和 final_timestamp_ms 之间
    } else {
      return "releasing"; // 当前时间在 final_timestamp_ms 之后
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

  const { data: coinMeta } = useSuiClientQuery(
    "getCoinMetadata",
    { coinType: currentClaim?.token_type },
    {
      enabled: !!currentClaim?.token_type, // Only run the query if selectMintCoin.address is defined
    }
  );
  // console.log('coinMeta: ', coinMeta)
  const {
    data: ownObjects1,
    error,
    isLoading,
  } = useSuiClientQuery(
    "multiGetObjects",
    {
      ids: [sureAddress],
      options: { showType: true, showContent: true },
    },
    {
      enabled: !!sureAddress, // Only run the query if selectMintCoin.address is defined
    }
  );

  // 监听查询结果
  useEffect(() => {
    if (ownObjects1) {
      const item = ownObjects1[0] || {};

      if (item?.error) {
        message.destroy();
        message.error("ID is notExists!");
        setLoading(false);

        setSureAddress("");
        return;
      }

      const temp = item.data?.content?.fields;
      const { current_balance, start_timestamp_ms, cliff_timestamp_ms } =
        temp || {};
      const status = getStatus(temp || {});
      const _currentBalance = Math.floor(
        Number(current_balance || 0) / 10 ** (coinMeta?.decimals || 9)
      );
      const symbol = temp?.token_type?.split("::")?.[2];
      const schedules = {
        ...temp,
        current_balance: _currentBalance + " " + symbol,
        status,
        symbol,
        lockupDuration: calculateLockDuration(
          start_timestamp_ms,
          cliff_timestamp_ms
        ),
      };

      message.destroy();
      setLoading(false);

      // setVestingSchedules(schedules);
      setCurrentVesting(schedules);
      setVestingInfoModalVisible(true); // 打开弹窗
    }
  }, [ownObjects1]);

  const onSearch = () => {
    if (!searchValue) return;
    setSureAddress(searchValue);
    if (currentVesting?.id) {
      setVestingInfoModalVisible(true);
      return;
    }
    // setSureAddress(searchValue);
    setLoading(true);
    message.loading("Loading...");
    setTimeout(() => {
      message.destroy();
      setLoading(false);
    }, 10 * 1000);
    // setVestingInfoModalVisible(true);
    // setCurrentVesting(data);
  };

  const handleCancel = () => {
    setVestingInfoModalVisible(false);

    setSureAddress("");
    setCurrentVesting({});
  };
  // 取消锁定
  const handleClaim = async () => {
    if (submiting) return;

    setSubmiting(true);
    message.destroy();
    message.loading("Submiting, please waiting...", 10);

    const tx = new Transaction();
    tx.setGasBudget(100000000);

    const { token_type, id } = currentVesting || {};
    tx.moveCall({
      target:
        "0xfa46068c7b307fdb71010cb5fef8645af029286989d7032c9a7cb5bd675a69b4::vesting_lock::claim_vested",
      typeArguments: [token_type],
      arguments: [tx.object(id?.id), tx.object("0x6")],
    });

    // Dry run
    tx.setSender(walletAddress);
    const dryRunRes = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    if (dryRunRes.effects.status.status === "failure") {
      setSubmiting(false);
      message.destroy();
      const errorStr = dryRunRes.effects.status.error;
      if(errorStr.includes("err_not_in_recipient")) {
        message.error('CurrentAccount not in recipient');
        return;
      }
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

          setSubmiting(false);
          message.destroy();
          message.success("Claim Success!");
          setVestingInfoModalVisible(false);

          // 刷新
          setTimeout(() => {
            fetchVestingHistory();
          }, 1000);
        },
        onError: (err) => {
          setSubmiting(false);
          message.destroy();
          message.error(err.message);
        },
      }
    );
  };

  const fetchVestingHistory = async () => {
    if (!walletAddress) return;
    setTableLoading(true);
    const chainIdentifierQuery = graphql(`
      query ByTxSender {
        events(
          first: 50
          filter: {
            sender: "${walletAddress}"
          eventType:"0xfa46068c7b307fdb71010cb5fef8645af029286989d7032c9a7cb5bd675a69b4::vesting_lock::ClaimLocker"
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
            transactionBlock{
              digest
            }
            timestamp
          }
        }
      }
  `);
    const data = await gqlClient
      .query({
        query: chainIdentifierQuery,
      })
      .catch((err) => {
        setTableLoading(false);
        message.error("Request timed out");
      });

    setTableLoading(false);
    const result =
      data?.data?.events?.nodes?.map((item) => {
        const { amount, lock_id, token_type } = item?.contents?.json || {};
        let _tokenType = "0x" + token_type;
        const symbol = _tokenType?.split("::")?.[2];
        return {
          amount,
          lock_id,
          token_type: _tokenType,
          symbol,
          date: item?.timestamp,
          transBlock: item?.transactionBlock?.digest,
        };
      }) || [];
    setDataSource(result);

    // 清空地址
    setSureAddress("");
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
    },
    {
      title: "Symbol",
      dataIndex: "symbol",
    },
    {
      title: "Info",
      key: "info",
      width: 260,
      render: (_, record) => (
        <div className="flex ">
          <div
            className=" text-[#2cb4cd] text-[14px] mr-4  cursor-pointer"
            onClick={() => {
              setSureAddress(record?.lock_id);
              setCurrentClaim(record);

              message.destroy();
              message.loading("Loading...", 0);

              // setTimeout(() => {
              //   onSearch();
              // }, 500);
            }}
          >
            Lock Info
          </div>
          <div
            className=" text-[#2cb4cd] text-[14px] cursor-pointer"
            onClick={() => {
              window.open(
                `https://testnet.suivision.xyz/txblock/${record?.transBlock}?tab=Changes`
              );
            }}
          >
            Transaction Detail
          </div>
        </div>
      ), // 按钮处理信息
    },
  ];

  return (
    <div className="px-6 pt-[100px] flex flex-col justify-center">
      <Input.Search
        ref={searchRef}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder="input Vesting & Lock ID"
        enterButton="Search"
        size="large"
        className="w-[80%] mx-auto mb-4"
        onSearch={onSearch}
        loading={loading}
      />
      {/* {!vestingSchedules?.length && (
        <div className="mb-4 text-2xl">No Vesting Schedule</div>
      )} */}
      <Divider className="mt-20" />
      <div className="p-4 bg-white">
        <h1 className="mb-2 text-[26px]">Claim History</h1>
        <Table
          dataSource={dataSource}
          columns={columns}
          pagination={false}
          loading={tableLoading}
        />
      </div>
      {/* 查看对话框 */}
      <VestingInfoModal
        visible={vestingInfoModalVisible}
        data={currentVesting}
        isClaim={true}
        onClose={handleCancel}
        onClaim={handleClaim}
      />
    </div>
  );
}
