import React, { useState, useEffect } from "react";
import { Form, Input, Upload, Button, message } from "antd";
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
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

const actionOptions = [
  { name: "Add", value: "add" },
  { name: "Remove", value: "remove" },
  // { name: "Check", value: "check" },
];

export default function UpdateAddress() {
  const [selectedValue, setSelectedValue] = useState("");

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
          console.log(err);
        },
      }
    );
  };
  const handleToggleChange = (value) => {
    setSelectedValue(value);
  };

  return (
    <div className="pb-10">
      <div className="pt-4 text-[40px] text-center">
        Regcoin Add Remove Deny Address
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <ToggleSwitch options={actionOptions} onChange={handleToggleChange} />
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
    </div>
  );
}
