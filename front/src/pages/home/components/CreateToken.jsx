import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Upload,
  Button,
  Typography,
  InputNumber,
  Switch,
  message,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import {
  useCurrentAccount,
  useAccounts,
  useSuiClient,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiObjectId } from "@mysten/sui/utils";
import initMoveByteCodeTemplate from "@mysten/move-bytecode-template";
import BigNumber from "bignumber.js";
import { generateBytecode } from "../create-coin-utils";
import { getTreasuryCapObjects } from "../utils";

import ToggleSwitch from "../../../components/ToggleSwitch";

export default function CreateToken() {
  const [selectedValue, setSelectedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [maxSupply, setMaxSupply] = useState(10000000000);
  const [maxSupplyLabel, setMaxSupplyLabel] = useState("100 billion");

  const [isDropTreasury, setIsDropTreasury] = useState(true);
  const [isMetaDataMut, setIsMetaDataMut] = useState(false);
  const [form] = Form.useForm();
  //   const account = useCurrentAccount();
  const client = useSuiClient();
  const [account] = useAccounts();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // useEffect(() => {
  //   if (isDropTreasury) {
  //     setIsMetaDataMut(true);
  //   }
  // }, [isDropTreasury]);

  const coinTypeOptions = [
    { name: "Simple Coin", value: "simpleCoin" },
    { name: "Regulated Coin", value: "RegionalCoin" },
  ];

  const onFinish = async (values) => {
    const { iconUrl, iconFiles, ...reset } = values;
    const file = values.iconFiles?.[0]?.originFileObj;

    let newIconUrl = iconUrl; // 默认使用原来的 iconUrl

    if (file) {
      message.info("Uploading file...", 0);
      const blobId = await handleUpload(file);
      console.log("Uploaded file blob ID:", blobId);
      if (blobId) {
        newIconUrl = `https://aggregator.walrus-testnet.walrus.space/v1/${blobId}`;
      }
      message.destroy();
    }
    if (!newIconUrl) {
      message.error("Please upload an image");
      return;
    }

    const params = {
      ...reset,
      iconUrl: newIconUrl,
      // coinType: "RegionalCoin",
      coinType: selectedValue || coinTypeOptions[0].value,
      isDropTreasury,
      isMetaDataMut,
    };

    handleTx(params);
  };

  async function handleTx(coinMeta) {
    setLoading(true);
    message.loading("Submiting, please waiting...", 0);

    const tx = new Transaction();
    tx.setGasBudget(1000000000);

    await initMoveByteCodeTemplate("/pkg/move_bytecode_template_bg.wasm");
    const updated = await generateBytecode(coinMeta);

    const [upgradeCap] = tx.publish({
      modules: [[...updated]],
      dependencies: [normalizeSuiObjectId("0x1"), normalizeSuiObjectId("0x2")],
    });
    tx.transferObjects([upgradeCap], account.address);
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
          let supply = 0;
          if (coinMeta.mintAmout > 0) {
            supply = BigNumber(coinMeta.mintAmout).times(
              BigNumber(10).pow(coinMeta.decimals || 9)
            );
            const packageIds = finalRes.effects.created;
            const treasuryCapObjects = await getTreasuryCapObjects(
              client,
              packageIds
            );
            const tx2 = new Transaction();
            tx2.setGasBudget(1000000000);

            tx2.moveCall({
              target: "0x2::coin::mint_and_transfer",
              typeArguments: [treasuryCapObjects[0].type],
              arguments: [
                tx2.object(treasuryCapObjects[0].objectId),
                tx2.pure.u64(supply.toString()),
                tx2.pure.address(account.address),
              ],
            });
            tx2.setSender(account.address);
            signAndExecuteTransaction(
              {
                transaction: tx2,
              },
              {
                onSuccess: async (txRes) => {
                  setLoading(false);
                  message.destroy();
                  message.success("Tx Success! Mint Token!");
                },
                onError: (err) => {
                  setLoading(false);
                  message.destroy();
                  message.error(err.message);
                },
              }
            );
          }
          message.destroy();
          message.success("Tx Success! Create Coin!");
        },
        onError: (err) => {
          message.destroy();
          message.error(err.message);
        },
      }
    );
  }

  const normFile = (e) => {
    if (Array.isArray(e)) {
      return e;
    }
    return e?.fileList;
  };
  const handleUpload = async (file) => {
    try {
      const response = await fetch(
        `https://publisher.walrus-testnet.walrus.space/v1/store?epochs=100`,
        {
          method: "PUT",
          body: file,
        }
      );

      if (response.status === 200) {
        const info = await response.json();
        console.log("Upload successful:", info);
        const blobId =
          info.newlyCreated?.blobObject?.blobId ||
          info?.alreadyCertified?.blobId;
        message.success("Upload successful!");
        return blobId;
      } else {
        throw new Error("Something went wrong when storing the blob!");
      }
    } catch (error) {
      console.error("Error uploading the file:", error);
      message.error("Failed to upload the file.");
      return undefined;
    }
  };

  const handleToggleChange = (value) => {
    setSelectedValue(value);
    console.log("Selected value:", value); // 打印选中的值
  };

  function getMaxSupply(precision) {
    // 计算最大供应量
    const maxSupply = Math.pow(10, 19 - precision);

    let supplyString = "";
    if (maxSupply >= 1e12) {
      // 大于等于一万亿，用“万亿”作单位
      supplyString = (maxSupply / 1e12).toFixed(0) + "万亿";
    } else if (maxSupply >= 1e8) {
      // 大于等于一亿，用“亿”作单位
      supplyString = (maxSupply / 1e8).toFixed(0) + "亿";
    } else if (maxSupply >= 1e4) {
      // 大于等于一万，用“万”作单位
      supplyString = (maxSupply / 1e4).toFixed(0) + "万";
    } else {
      // 小于一万，直接输出数字
      supplyString = maxSupply.toString();
    }

    return {
      number: maxSupply,
      string: supplyString,
    };
  }

  function getMaxSupply(precision) {
    // Calculate the maximum supply
    const maxSupply = Math.pow(10, 19 - precision);

    let supplyString = "";
    if (maxSupply >= 1e12) {
      // Greater than or equal to one trillion, use 'trillion' as the unit
      supplyString = (maxSupply / 1e12).toFixed(0) + " trillion";
    } else if (maxSupply >= 1e8) {
      // Greater than or equal to one billion, use 'billion' as the unit
      supplyString = (maxSupply / 1e8).toFixed(0) + " billion";
    } else if (maxSupply >= 1e6) {
      // Greater than or equal to one million, use 'million' as the unit
      supplyString = (maxSupply / 1e6).toFixed(0) + " million";
    } else if (maxSupply >= 1e3) {
      // Greater than or equal to one thousand, use 'thousand' as the unit
      supplyString = (maxSupply / 1e3).toFixed(0) + " thousand";
    } else {
      // Less than one thousand, output the number directly
      supplyString = maxSupply.toString();
    }

    return {
      number: maxSupply,
      string: supplyString,
    };
  }

  // 当 decimals 值变化时，更新最大供应量
  const handleDecimalsChange = (value) => {
    if (value !== undefined) {
      const { number, string } = getMaxSupply(value);
      setMaxSupply(number); // 更新最大供应量
      setMaxSupplyLabel(string); // 更新最大供应量单位标签
      // form.setFieldsValue({
      //   mintAmout: 0, // 重置 mintAmount 的值
      // });
    }
  };

  return (
    <div className="pb-10">
      <div className="py-4 text-[40px] text-center">CREATE COIN</div>
      <div className="w-[700px] m-auto p-8 bg-white">
        <ToggleSwitch options={coinTypeOptions} onChange={handleToggleChange} />
        <div className="mt-2 mb-6 text-[24px]">Coin Generator</div>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            decimals: 9,
            isMetaDataMut: true,
          }}
        >
          <div className="mb-4 text-[16px]">1.Code Details</div>
          <Form.Item
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please input the coin name!" },
              {
                min: 2,
                max: 32,
                message: "Name must be between 2 and 32 characters",
              },
              {
                pattern: /^[a-zA-Z]*$/,
                message: "Name can only contain letters",
              },
            ]}
          >
            <Input placeholder="Eg. Sui" />
          </Form.Item>

          <Form.Item
            name="symbol"
            label="Coin Symbol"
            rules={[
              { required: true, message: "Please input the coin symbol!" },
              {
                min: 5,
                max: 8,
                message: "Symbol must be between 5 and 8 characters",
              },
              {
                pattern: /^[a-zA-Z]*$/,
                message: "Symbol can only contain letters",
              },
            ]}
          >
            <Input placeholder="Eg. SUI" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[
              { required: true, message: "Please input the description!" },
            ]}
          >
            <Input.TextArea placeholder="Eg. Some description about the coin" />
          </Form.Item>

          <div className="mb-4 text-[16px]">2.Add Coin Image</div>
          <Form.Item name="iconUrl" label="Coin Image URL">
            <Input placeholder="Eg. https://sui.com/images/logo.png" />
          </Form.Item>

          <Form.Item
            name="iconFiles"
            label="Or Upload Image"
            valuePropName="fileList"
            getValueFromEvent={normFile}
            extra="Currently using Walrus testnet"
          >
            <Upload
              beforeUpload={() => false}
              multiple={false}
              style={{ width: "100%" }}
            >
              <Button icon={<UploadOutlined />}>
                Drop your file here or upload
              </Button>
            </Upload>
          </Form.Item>

          <div className="mb-4 text-[16px]">3.Coin Features</div>
          <Form.Item
            name="decimals"
            label="Coin Decimals"
            rules={[
              {
                required: true,
                message: "Please input the number of decimals!",
              },
            ]}
            extra="Enter token decimal precision (default: 9 if unsure)"
          >
            <InputNumber
              min={0}
              placeholder="Eg. 9"
              style={{ width: "100%" }}
              onChange={handleDecimalsChange}
            />
          </Form.Item>

          <Form.Item
            name="mintAmout"
            label={`Supply (max: ${maxSupplyLabel})`}
            rules={[
              { required: true, message: "Please input the total supply!" },
            ]}
            extra="Enter initial token supply to mint (use 0 if unsure; supply can be minted later on the mint page)"
          >
            <InputNumber
              min={0}
              max={maxSupply}
              placeholder="Your total coin supply"
              style={{ width: "100%" }}
            />
          </Form.Item>

          <div className="flex justify-between items-center mb-5">
            <div>
              <div>Revoke Update (Immutable)</div>
             
            </div>
            <Switch value={isMetaDataMut} onChange={setIsMetaDataMut} />
          </div>
          <div className="text-gray-500">Metadata locked when selected. Leave unselected to edit later in Revoke</div>
          

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
                Generate Coin
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
