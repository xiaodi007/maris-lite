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
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

export default function VestCreate() {
  const [selectMintCoin, setSelectMintCoin] = useState({});
  const [includeCliff, setIncludeCliff] = useState(true);
  const [revocable, setRevocable] = useState(true);
  const [selectTokenModalVisible, setSelectTokenModalVisible] = useState(false);
  const [form] = Form.useForm();

  const client = useSuiClient();
  const [account] = useAccounts();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const walletAddress = account?.address;

  const { data: suiBalances } = useSuiClientQuery("getAllBalances", {
    owner: walletAddress,
  });

  // const { data: suiBalance } = useSuiClientQuery(
  //   "getBalance",
  //   { owner: walletAddress,
  //   coinType: "0xad68e7d1ed4f683201e578a056e8e414f4092fc6d502d031047c57060cac5567::adf::ADF"},

  // );
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
  const denyCapV2 = filterGroupsByType(coinGroupData, "DenyCapV2");

  const { data: coinMeta1 } = useSuiClientQuery(
    "getCoinMetadata",
    { coinType: selectMintCoin?.address },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );

  const { data: coinInfo } = useSuiClientQuery(
    "getCoins",
    { 
      owner: walletAddress ?? "",
      coinType: selectMintCoin?.address },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );

  const currentBalance = suiBalances?.find(
    (coin) => coin?.coinType === selectMintCoin?.address
  );

  const totalBalance = Math.floor(
    Number(currentBalance?.totalBalance || 0) / 10 ** (coinMeta1?.decimals || 9)
  );

  const onFinish = (values) => {
    const { name, description } = coinMeta1 || {};
    const { coinAddress, recipient, amount, startDate, finalDate, cliffDate } =
      values || {};
    const params = {
      coinAddress,
      title: name,
      description,
      start_timestamp_ms: startDate?.valueOf(),
      cliff_timestamp_ms: cliffDate ? cliffDate?.valueOf() : null,
      final_timestamp_ms: finalDate?.valueOf(),
      amount,
      revocable,
      recipient,
    };
    handleSave(params);
  };

  const handleSave = async (vestingCoin) => {
    const tx = new Transaction();

    tx.setGasBudget(100000000);
    // const supply = BigNumber(vestingCoin.amount).times(
    //   BigNumber(10).pow(coinMeta1.decimals || 9)
    // );

    // const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(supply)]);
    const coin = coinInfo?.data?.[0];
    tx.moveCall({
      target:
        "0x1cb16f568d8bfd055ba2d692d3c110bc8a7d4b7841b28c4f39e05e6f39b385ff::vesting_lock::new_lock",
      typeArguments: [vestingCoin.coinAddress],
      arguments: [
        tx.pure.string(vestingCoin.title),
        tx.pure.option("string", vestingCoin.description),
        tx.pure.u64(vestingCoin.start_timestamp_ms),
        tx.pure.option("u64", vestingCoin.cliff_timestamp_ms),
        tx.pure.u64(vestingCoin.final_timestamp_ms),
        tx.object(coin.coinObjectId),
        tx.pure.bool(vestingCoin.revocable),
        tx.pure.address(vestingCoin.recipient),
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
          const finalRes = await client.waitForTransaction({
            digest: txRes.digest,
            options: {
              showEffects: true,
            },
          });
        
          const packageId = finalRes.effects.created?.find(
            (item) => item.owner === "Immutable"
          )?.reference.objectId;
          message.success("Tx Success!");
        },
        onError: (err) => {
          message.error(err.message);
        },
      }
    );
  };

  return (
    <div className="pb-10">
      <div className="pt-4 text-[40px] text-center">Lock Create</div>
      <div className="text-[16px] text-center text-gray-500">
        Easily Set Up Locks.
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            decimals: 9,
            startDate: dayjs(),
            finalDate: dayjs().add(1, "days"),
          }}
          className="mt-5"
        >
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
            name="coinAddress"
            label="Token Address"
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
            name="amount"
            label="Lock Amount"
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

          <Form.Item
            name="startDate"
            label="Start Date"
            rules={[
              { required: true, message: "Please select the start date" },
            ]}
          >
            <DatePicker
              // showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD"
              style={{ width: "100%" }}
            />
          </Form.Item>

          {/* {includeCliff && (
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
          )} */}

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
              // showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD"
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
            {/* <div>
              includeCliff
              <Switch
                checked={includeCliff}
                onChange={(value) => setIncludeCliff(value)}
                className="ml-2"
              />
            </div> */}
          </Row>

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
                disabled={!account}
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
        data={denyCapV2}
        field={"coinType"}
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
