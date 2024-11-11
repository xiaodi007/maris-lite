import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Button,
  message,
  DatePicker,
  Switch,
  Row,
  Select,
} from "antd";
import { SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  useAccounts,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import SelectTokenModal from "../../../components/SelectTokenModal";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import VestingTimeLine from "../../../components/VestingTimeLine";
import ToggleSwitch from "../../../components/ToggleSwitch";
dayjs.extend(isBetween);

const CLAIM_TYPE_MS = {
  linear: 1,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const actionOptions = [
  { name: "Normal", value: "normal" },
  { name: "Simple", value: "simple" },
];

export default function VestCreate() {
  const [selectedValue, setSelectedValue] = useState("normal");
  const [selectMintCoin, setSelectMintCoin] = useState({});
  const [chartDataRow, setChartDataRow] = useState({});
  const [includeCliff, setIncludeCliff] = useState(false);
  const [revocable, setRevocable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectTokenModalVisible, setSelectTokenModalVisible] = useState(false);
  const [form] = Form.useForm();

  const client = useSuiClient();
  const [account] = useAccounts();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const walletAddress = account?.address;

  const { data: _suiBalances } = useSuiClientQuery("getAllBalances", {
    owner: walletAddress,
  });
  const suiBalances = _suiBalances?.map((item) => {
    return { ...item, address: item.coinType };
  });
  // console.log("suiBalances: ", suiBalances);

  // const { data: ownObjects } = useSuiClientQuery("getOwnedObjects", {
  //   owner: walletAddress ?? "",
  //   options: { showType: true },
  //   filter: {
  //     MoveModule: {
  //       package: "0x2",
  //       module: "coin",
  //     },
  //   },
  // });
  // console.log("ownObjects: ", ownObjects);

  const { data: coinMeta1 } = useSuiClientQuery(
    "getCoinMetadata",
    { coinType: selectMintCoin?.address },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );
  console.log("coinMeta1: ", coinMeta1);
  const { data: coinInfo } = useSuiClientQuery(
    "getCoins",
    {
      owner: walletAddress ?? "",
      coinType: selectMintCoin?.address,
    },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );

  // console.log("coinInfo", coinInfo);
  const currentBalance = suiBalances?.find(
    (coin) => coin?.coinType === selectMintCoin?.address
  );

  const totalBalance = Math.floor(
    Number(currentBalance?.totalBalance || 0) / 10 ** (coinMeta1?.decimals || 9)
  );

  // 使用 Form 的 onValuesChange 处理变化
  const handleValuesChange = (changedValues, allValues) => {
    // 将所有表单数据传递给子组件或父组件
    const { amount, claimType, startDate, cliffDate, finalDate } =
      allValues || {};
    const _cliffDate = cliffDate ? dayjs(cliffDate) : dayjs(startDate);
    setChartDataRow({
      amount,
      claimType,
      startDate: dayjs(startDate).format("YYYY-MM-DD HH:mm"),
      cliffDate: _cliffDate.format("YYYY-MM-DD HH:mm"),
      finalDate: dayjs(finalDate).format("YYYY-MM-DD HH:mm"),
    });
  };

  const onFinish = (values) => {
    // const { name, description } = coinMeta1 || {};
    const {
      coinAddress,
      recipient,
      amount,
      claimType,
      startDate,
      finalDate,
      cliffDate,
      unlockDate,
      title,
      description,
    } = values || {};

    let params = {};
    const baseParams = {
      coinAddress,
      title: title,
      description,
      claimType: claimType || 'linear',
      interval_duration_ms: CLAIM_TYPE_MS[claimType || 'linear'],
      amount,
      revocable,
      recipient,
    };
    // 正常模式创建
    if (selectedValue === "normal") {
      params = {
        ...baseParams,
        start_timestamp_ms: startDate?.valueOf(),
        cliff_timestamp_ms: cliffDate ? cliffDate?.valueOf() : null,
        final_timestamp_ms: finalDate?.valueOf(),
      };
    } else {
      // 简单模式创建
      params = {
        ...baseParams,
        start_timestamp_ms: dayjs().valueOf(),
        cliff_timestamp_ms: unlockDate?.valueOf() - 1,
        final_timestamp_ms: unlockDate?.valueOf(),
      };
    }

    handleSave(params);
  };

  const handleSave = async (vestingCoin) => {
    const tx = new Transaction();
    tx.setGasBudget(100000000);

    let { amount } = vestingCoin;
    const coins = coinInfo?.data;
    const coin = coins?.[0] || {};
    let finalCoin = null;

    amount = BigNumber(amount)
      .times(BigNumber(10).pow(coinMeta1.decimals || 9))
      ?.toString();
    let isSUI = coin?.coinType === "0x2::sui::SUI";
    if (isSUI) {
      finalCoin = tx.splitCoins(tx.gas, [amount]);
    } else {
    // 如果coinObjectCount==1 则直接分币
    if (currentBalance?.coinObjectCount === 1) {
      finalCoin = tx.splitCoins(tx.object(coin?.coinObjectId), [amount]);
    } else if (currentBalance?.coinObjectCount > 1) {
      // 如果coinObjectCount>1 则先合并
      let [primaryCoin, ...mergedCoin] = coins.map((_coin) =>
        tx.object(_coin.coinObjectId)
      );

      if (mergedCoin.length) {
        tx.mergeCoins(primaryCoin, mergedCoin);
      }

      // 再分币
      finalCoin = tx.splitCoins(primaryCoin, [amount]);
    }
    }

    setLoading(true);
    message.loading("Submiting, please waiting...", 0);
    
    tx.moveCall({
      target:
        "0xfa46068c7b307fdb71010cb5fef8645af029286989d7032c9a7cb5bd675a69b4::vesting_lock::new_lock",
      typeArguments: [vestingCoin.coinAddress],
      arguments: [
        tx.pure.string(vestingCoin.title),
        tx.pure.option("string", vestingCoin.description),
        tx.pure.string("lock"),
        tx.pure.string(vestingCoin.claimType),
        tx.pure.u64(vestingCoin.start_timestamp_ms),
        tx.pure.option("u64", vestingCoin.cliff_timestamp_ms),
        tx.pure.u64(vestingCoin.final_timestamp_ms),
        finalCoin,
        tx.pure.bool(vestingCoin.revocable),
        tx.pure.address(vestingCoin.recipient),
        tx.pure.u64(vestingCoin.interval_duration_ms),
      ],
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
          setLoading(false);

          const finalRes = await client.waitForTransaction({
            digest: txRes.digest,
            options: {
              showEffects: true,
            },
          });

          const packageId = finalRes.effects.created?.find(
            (item) => item.owner === "Immutable"
          )?.reference.objectId;
          message.destroy();
          message.success("Tx Success!");
        },
        onError: (err) => {
          setLoading(false);
          message.destroy();
          message.error(err.message);
        },
      }
    );
  };

  return (
    <div className="pb-10">
      <div className="pt-4 text-[40px] text-center">Vesting & Lock Create</div>
      <div className="text-[16px] text-center text-gray-500">
        Easily Set Up Vesting & Lock.
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <ToggleSwitch options={actionOptions} onChange={setSelectedValue} />
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            decimals: 9,
            claimType: "linear",
            startDate: dayjs(),
            finalDate: dayjs().add(1, "year"),
          }}
          className="mt-5"
          onValuesChange={handleValuesChange}
        >
          <Form.Item
            name="coinAddress"
            label="Vest Token Address"
            rules={[
              { required: true, message: "Please select the Token Address!" },
            ]}
          >
            <Input
              prefix={<SearchOutlined />}
              placeholder="please select"
              autocomplete="off"
              onClick={() => setSelectTokenModalVisible(true)}
            />
          </Form.Item>
          <Form.Item
            name="recipient"
            label="Recipient Address"
            rules={[
              {
                required: true,
                message: "Please input the recipient address!",
              },
            ]}
          >
            <Input placeholder="Input Address" />
          </Form.Item>
          <Form.Item
            name="title"
            label="title"
            rules={[
              {
                required: true,
                message: "Please input the title!",
              },
            ]}
          >
            <Input placeholder="type a name" />
          </Form.Item>
          <Form.Item
            name="description"
            label="description"
            rules={[
              {
                required: true,
                message: "Please input the descriptor!",
              },
            ]}
          >
            <Input placeholder="type a description" />
          </Form.Item>

          <Form.Item
            name="amount"
            label={`Vesting Amount ${
              totalBalance ? `(Max: ${totalBalance})` : ""
            }`}
            rules={[
              {
                required: true,
                message: "Please input the number of amount!",
              },
            ]}
          >
            <InputNumber
              min={0}
              max={totalBalance || 1}
              placeholder="please input"
              style={{ width: "100%" }}
            />
          </Form.Item>

          {selectedValue === "normal" ? (
            <>
              <Form.Item name="claimType" label="Claim Type">
                <Select placeholder="please Select" style={{ width: "100%" }}>
                  <Select.Option value={"linear"}>Linear</Select.Option>
                  <Select.Option value={"weekly"}>Weekly</Select.Option>
                  <Select.Option value={"monthly"}>Monthly</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="startDate"
                label="Start Date"
                rules={[
                  { required: true, message: "Please select the start date" },
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: "100%" }}
                />
              </Form.Item>

              {includeCliff && (
                <Form.Item
                  name="cliffDate"
                  label="Cliff Date"
                  dependencies={["startDate", "finalDate"]}
                  rules={[
                    { required: true, message: "Please select the cliff date" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const startDate = getFieldValue("startDate");
                        const finalDate = getFieldValue("finalDate");
                        if (
                          !value ||
                          (startDate &&
                            finalDate &&
                            value.isBetween(startDate, finalDate))
                        ) {
                          return Promise.resolve();
                        }
                        return Promise.reject(
                          new Error(
                            "Cliff Date must be between Start Date and Final Date"
                          )
                        );
                      },
                    }),
                  ]}
                >
                  <DatePicker
                    showTime={{ format: "HH:mm" }}
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              )}

              <Form.Item
                name="finalDate"
                label="Final Date"
                dependencies={["startDate"]}
                rules={[
                  { required: true, message: "Please select the final date" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const startDate = getFieldValue("startDate");
                      if (!startDate || !value || startDate.isBefore(value)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(
                        new Error("Final Date must be after Start Date")
                      );
                    },
                  }),
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: "100%" }}
                />
              </Form.Item>

              <Row className="mb-10">
                <div className="mr-2">
                  revocable
                  <Switch
                    checked={revocable}
                    onChange={(value) => setRevocable(value)}
                    className="ml-2"
                  />
                </div>
                <div>
                  includeCliff
                  <Switch
                    checked={includeCliff}
                    onChange={(value) => {
                      setIncludeCliff(value);
                      form.setFieldsValue({ cliffDate: null });
                      setChartDataRow({
                        ...chartDataRow,
                        cliffDate: chartDataRow?.startDate,
                      });
                    }}
                    className="ml-2"
                  />
                </div>
              </Row>
              <VestingTimeLine dataRow={chartDataRow} />
            </>
          ) : (
            <>
              <Form.Item
                name="unlockDate"
                label="Unlock Date"
                rules={[
                  { required: true, message: "Please select the unlock date" },
                ]}
              >
                <DatePicker
                  showTime={{ format: "HH:mm" }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </>
          )}

          {!account && (
            <div className="text-center mb-6">
              <Button danger size="large">
                Please, Connect Your Wallet
              </Button>
            </div>
          )}
          <Form.Item>
            <div className="text-center">
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                disabled={!account || loading}
              >
                Approve Token
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 选择对话框 */}
      <SelectTokenModal
        visible={selectTokenModalVisible}
        data={suiBalances}
        onClose={() => setSelectTokenModalVisible(false)}
        onSelect={(data) => {
          setSelectMintCoin(data);
          form.setFieldsValue({ coinAddress: data.address });
          setSelectTokenModalVisible(false);
        }}
      />
    </div>
  );
}
