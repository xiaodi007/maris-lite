import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Upload,
  Button,
  Row,
  Col,
  message,
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
import ToggleSwitch from "../../../components/ToggleSwitch";
import { groupByAddress, filterGroupsByType, findObjectByAddressAndType } from "../utils";

const { Dragger } = Upload;
const coinTypeOptions = [
  { name: "Update Token", value: "Update Token" },
  // { name: "Update NFT", value: "Update NFT" },
];

export default function UpdateMetadata() {
  const [loading, setLoading] = useState(false);
  const [selectTokenModalVisible, setSelectTokenModalVisible] = useState(false);
  const [form] = Form.useForm();

  const client = useSuiClient();
  const [account] = useAccounts();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const walletAddress = account?.address;
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
  const treasuryCapData = filterGroupsByType(coinGroupData, "TreasuryCap");
  const coinMetadata = filterGroupsByType(treasuryCapData, "CoinMetadata");

  const normFile = (e) => {
    if (Array.isArray(e)) {
      return e;
    }
    return e?.fileList;
  };

  const handleToggleChange = (value) => {
    setSelectedValue(value);
  };

  const onFinish = (values) => {
    handleSave(values);
  };

  const handleSave = async (mintCoin) => {
    const tx = new Transaction();

    const selecUpdateCointreasury = findObjectByAddressAndType(
      coinGroupData,
      mintCoin.coinAddress,
      "TreasuryCap"
    );
    const selectUpdateCoinMetaData = findObjectByAddressAndType(
      coinGroupData,
      mintCoin.coinAddress,
      "CoinMetadata"
    );

    setLoading(true);
    message.loading("Submiting, please waiting...", 0);

    if (mintCoin.newName) {
      tx.moveCall({
        target: "0x2::coin::update_name",
        typeArguments: [mintCoin.coinAddress],
        arguments: [
          tx.object(selecUpdateCointreasury.objectId),
          tx.object(selectUpdateCoinMetaData.objectId),
          tx.pure.string(mintCoin.newName),
        ],
      });
    }

    if (mintCoin.newSymbol) {
      tx.moveCall({
        target: "0x2::coin::update_symbol",
        typeArguments: [mintCoin.coinAddress],
        arguments: [
          tx.object(selecUpdateCointreasury.objectId),
          tx.object(selectUpdateCoinMetaData.objectId),
          tx.pure.string(mintCoin.newSymbol),
        ],
      });
    }
    if (mintCoin.newIconUrl) {
      tx.moveCall({
        target: "0x2::coin::update_icon_url",
        typeArguments: [mintCoin.coinAddress],
        arguments: [
          tx.object(selecUpdateCointreasury.objectId),
          tx.object(selectUpdateCoinMetaData.objectId),
          tx.pure.string(mintCoin.newIconUrl),
        ],
      });
    }
    if (mintCoin.newDescription) {
      tx.moveCall({
        target: "0x2::coin::update_description",
        typeArguments: [mintCoin.coinAddress],
        arguments: [
          tx.object(selecUpdateCointreasury.objectId),
          tx.object(selectUpdateCoinMetaData.objectId),
          tx.pure.string(mintCoin.newDescription),
        ],
      });
    }

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
          message.destroy();
          message.success("Tx Success!");

          const finalRes = await client.waitForTransaction({
            digest: txRes.digest,
            options: {
              showEffects: true,
            },
          });
          const packageId = finalRes.effects.created?.find(
            (item) => item.owner === "Immutable"
          )?.reference.objectId;
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
      <div className="pt-4 text-[40px] text-center">Update Token Metadata</div>
      <div className="text-[16px] text-center text-gray-500">
        Easily Update the Metadata of your own Sui Token.
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <ToggleSwitch options={coinTypeOptions} onChange={handleToggleChange} />
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            decimals: 9,
            isMetaDataMut: true,
          }}
          className="mt-5"
        >
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="newName"
                label="Name"
                rules={[
                  { required: true, message: "Please input the coin name!" },
                  {
                    min: 2,
                    max: 32,
                    message: "Name must be between 2 and 32 characters",
                  },
                  {
                    pattern: /^[a-zA-Z0-9]*$/,
                    message: "Name can only contain letters and numbers",
                  },
                ]}
              >
                <Input placeholder="Eg. Sui" />
              </Form.Item>

              <Form.Item
                name="newSymbol"
                label="Coin Symbol"
                rules={[
                  { required: true, message: "Please input the coin symbol!" },
                  {
                    min: 5,
                    max: 8,
                    message: "Symbol must be between 5 and 8 characters",
                  },
                  {
                    pattern: /^[a-zA-Z0-9]*$/,
                    message: "Symbol can only contain letters and numbers",
                  },
                ]}
              >
                <Input placeholder="Eg. SUI" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="iconFiles"
                label="images"
                valuePropName="fileList"
                getValueFromEvent={normFile}
              >
                <Dragger
                  beforeUpload={() => false}
                  multiple={false}
                  style={{ width: "100%" }}
                  type="card"
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined />
                  </p>
                  <p className="ant-upload-text">Upload Image</p>
                </Dragger>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="newDescription" label="Description">
            <Input.TextArea placeholder="Eg. Some description about the coin" />
          </Form.Item>

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
                Update Token
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 选择对话框 */}
      <SelectTokenModal
        visible={selectTokenModalVisible}
        data={treasuryCapData}
        onClose={() => setSelectTokenModalVisible(false)}
        onSelect={(data) => {
          form.setFieldsValue({ coinAddress: data.address });
          setSelectTokenModalVisible(false);
        }}
      />
    </div>
  );
}
