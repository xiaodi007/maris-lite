import React, { useState, useEffect } from "react";
import { Form, Input, Alert, Button, message, notification } from "antd";
import { SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import SelectTokenModal from "../../../components/SelectTokenModal";
import ToggleSwitch from "../../../components/ToggleSwitch";
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

const actionOptions = [
  { name: "Add", value: "add" },
  { name: "Remove", value: "remove" },
  { name: "Check", value: "check" },
];

export default function UpdateAddress() {
  const [selectedValue, setSelectedValue] = useState("add");
  const [api, contextHolder] = notification.useNotification();
  const [selectTokenModalVisible, setSelectTokenModalVisible] = useState(false);
  const [form] = Form.useForm();

  const client = useSuiClient();
  const account = useCurrentAccount();
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
  const denyCapV2 = filterGroupsByType(coinGroupData, "DenyCapV2");

  const onFinish = (values) => {
    const { coinAddress, address } = values || {};
    const params = {
      coinAddress,
    };
    if (selectedValue === "add") {
      params.addAddress = address;
    } else if (selectedValue === "remove") {
      params.removeAddress = address;
    } else {
      params.checkAddress = address;
    }
    handleSave(params);
  };

  const handleSave = async (mintCoin) => {
    const tx = new Transaction();
    tx.setGasBudget(100000000);

    const temp = mintCoin?.coinAddress;
    const _address = temp?.substring(0, temp.lastIndexOf("::"));

    const selectMintCointreasury = findObjectByAddressAndType(
      denyCapV2,
      mintCoin.coinAddress,
      "DenyCapV2"
    );
    if (mintCoin.addAddress) {
      tx.moveCall({
        target: _address + "::" + "add_addr_from_deny_list",
        // typeArguments: [mintCoin.coinAddress,],
        arguments: [
          tx.object("0x403"),
          tx.object(selectMintCointreasury.objectId),
          tx.pure.address(mintCoin.addAddress),
        ],
      });
    }
    if (mintCoin.removeAddress) {
      tx.moveCall({
        target: _address + "::" + "remove_addr_from_deny_list",
        // typeArguments: [mintCoin.coinAddress,],
        arguments: [
          tx.object("0x403"),
          tx.object(selectMintCointreasury.objectId),
          tx.pure.address(mintCoin.removeAddress),
        ],
      });
    }
    if (mintCoin.checkAddress) {
      tx.moveCall({
        target: _address + "::" + "contain_addr_from_deny_list",
        typeArguments: [mintCoin.coinAddress],
        arguments: [
          tx.object("0x403"),
          // tx.object(selectMintCointreasury.objectId),
          tx.pure.address(mintCoin.checkAddress),
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
          const finalRes = await client.waitForTransaction({
            digest: txRes.digest,
            options: {
              showEffects: true,
              showEvents: true,
            },
          });
          const parsedJson = finalRes.events[0]?.parsedJson;
          message.success("Tx Success!");

          api["info"]({
            message: "Address Epoch Status",
            description: (
              <div>
                {/* <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Epoch Status</div> */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}
                >
                  <span style={{ fontWeight: "500", marginRight: "8px" }}>
                    Current Epoch:
                  </span>
                  <span
                    style={{
                      color: parsedJson.is_contain_current_epoch
                        ? "#4caf50"
                        : "#f44336",
                      fontWeight: "bold",
                    }}
                  >
                    {parsedJson.is_contain_current_epoch
                      ? "Included"
                      : "Not Included"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ fontWeight: "500", marginRight: "8px" }}>
                    Next Epoch:
                  </span>
                  <span
                    style={{
                      color: parsedJson.is_contain_next_epoch
                        ? "#4caf50"
                        : "#f44336",
                      fontWeight: "bold",
                    }}
                  >
                    {parsedJson.is_contain_next_epoch
                      ? "Included"
                      : "Not Included"}
                  </span>
                </div>
              </div>
            ),
            duration: 0,
          });
        },
        onError: (err) => {
          message.error(err.message);
          console.log(err);
        },
      }
    );
  };
  const handleToggleChange = (value) => {
    setSelectedValue(value);
  };

  const renderHint = () => {
    switch (selectedValue) {
      case "add":
        return (
          <>
            <strong>Adding to Deny List:</strong>
            <p style={{ margin: "4px 0" }}>
              Adding the address to the deny list will{" "}
              <strong>immediately prevent</strong> it from using this coin type
              as input. Starting from the next epoch, the address will also be
              unable to receive this coin type.
            </p>
          </>
        );
      case "remove":
        return (
          <>
            <strong>Removing from Deny List:</strong>
            <p style={{ margin: "4px 0" }}>
              Removing the address from the deny list will{" "}
              <strong>immediately allow</strong> it to use this coin type as
              input. However, it won’t be able to receive this coin type until
              the next epoch starts.
            </p>
          </>
        );
      case "check":
        return (
          <>
            <strong>Epoch Deny List Check:</strong>
            <p style={{ margin: "4px 0" }}>
              <strong>Current Epoch:</strong> Check if a specific address is on
              the deny list for the current epoch. If it is, the address is{" "}
              <strong>not allowed</strong> to receive this coin type during the
              current epoch.
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>Next Epoch:</strong> Check if a specific address is on the
              deny list for the next epoch. If it’s on the list, the address
              will <strong>immediately be unable</strong> to use this coin type
              as input, and starting from the next epoch, it will also be unable
              to receive this coin type.
            </p>
          </>
        );
      default:
        return "";
    }
  };

  return (
    <div className="pb-10">
      <div className="pt-4 text-[40px] text-center">
        Regcoin Add Remove Deny Address
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <ToggleSwitch options={actionOptions} onChange={handleToggleChange} />
        <Alert
          className="my-6"
          message={
            <div style={{ lineHeight: "1.6", fontSize: "16px" }}>
              {renderHint()}
            </div>
          }
          type="info"
        />
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

          <Form.Item
            name="address"
            label="Address"
            rules={[
              { required: true, message: "Please input the Token Address!" },
            ]}
          >
            <Input placeholder="Input Address" />
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
                disabled={!account}
              >
                Submit
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 选择对话框 */}
      <SelectTokenModal
        visible={selectTokenModalVisible}
        data={denyCapV2}
        onClose={() => setSelectTokenModalVisible(false)}
        onSelect={(data) => {
          form.setFieldsValue({ coinAddress: data.address });
          setSelectTokenModalVisible(false);
        }}
      />
      {contextHolder}
    </div>
  );
}
