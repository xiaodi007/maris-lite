import React, { useState, useEffect } from "react";
import { Form, Input, Button, message } from "antd";
import { SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  useAccounts,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import SelectTokenModal from "../../../components/SelectTokenModal";
import ToggleSwitch from "../../../components/ToggleSwitch";
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

const revokeTypeOptions = [
  { name: "Revoke MetaData", value: "RevokeToken" },
  { name: "Revoke Treasury Cap", value: "RevokeTreasury" },
];

export default function RevokeAuthority() {
  const [selectedValue, setSelectedValue] = useState("");
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

  const onFinish = (values) => {
    const params = {
      coinAddress: values?.coinAddress,
    };
    if (selectedValue === "RevokeTreasury") {
      params.isDropTreasuryData = true;
    } else {
      params.isFreezeMetaData = true;
    }
    handleSave(params);
  };

  const handleSave = async (mintCoin) => {
    setLoading(true);
    message.loading("Submiting, please waiting...", 0);

    const tx = new Transaction();

    const selectMintCointreasury = findObjectByAddressAndType(
      coinGroupData,
      mintCoin.coinAddress,
      "TreasuryCap"
    );
    const temp = mintCoin?.coinAddress;
    const _address = temp?.substring(0, temp.lastIndexOf("::"));

    tx.moveCall({
      target: _address + "::" + "drop_treasurycap",
      arguments: [tx.object(selectMintCointreasury.objectId)],
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
  const handleToggleChange = (value) => {
    setSelectedValue(value);
  };

  return (
    <div className="pb-10">
      <div className="pt-4 text-[40px] text-center">
        Revoke Authority
      </div>
      <div className="text-[16px] text-center text-gray-500">
        Easily revoke the Freeze Authority.
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <ToggleSwitch
          options={revokeTypeOptions}
          onChange={handleToggleChange}
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
                Revoke Freeze
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
