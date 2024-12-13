import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Upload,
  Button,
  InputNumber,
  Switch,
  message,
} from "antd";
import { SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import SelectTokenModal from "../../../components/SelectTokenModal";
import BigNumber from "bignumber.js";
import {
  groupByAddress,
  filterGroupsByType,
  findObjectByAddressAndType,
} from "../utils";

export default function TokenMint() {
  const [selectMintCoin, setSelectMintCoin] = useState({});
  const [loading, setLoading] = useState(false);
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


  const coinGroupData = groupByAddress(ownObjects || []);
  const treasuryCapData = filterGroupsByType(coinGroupData, "TreasuryCap");
  const coinMetadata = filterGroupsByType(coinGroupData, "CoinMetadata");
  const denyCapV2 = filterGroupsByType(coinGroupData, "DenyCapV2");

  const { data: coinMeta1 } = useSuiClientQuery(
    "getCoinMetadata",
    { coinType: selectMintCoin?.address },
    {
      enabled: !!selectMintCoin?.address, // Only run the query if selectMintCoin.address is defined
    }
  );

  const onFinish = (values) => {
    handleSave(values);
  };

  const handleSave = async (mintCoin) => {
    setLoading(true);
    message.loading("Submiting, please waiting...", 0);
    
    const tx = new Transaction();

    const supply = BigNumber(mintCoin.mintAmount).times(
      BigNumber(10).pow(coinMeta1?.decimals || 9)
    );
    const selectMintCointreasury = findObjectByAddressAndType(
      coinGroupData,
      mintCoin.coinAddress,
      "TreasuryCap"
    );


    tx.moveCall({
      target: "0x2::coin::mint_and_transfer",
      typeArguments: [mintCoin.coinAddress],
      arguments: [
        tx.object(selectMintCointreasury.objectId),
        tx.pure.u64(supply.toString()),
        tx.pure.address(mintCoin.recipient),
      ],
    });
    // Dry run
    tx.setSender(account.address);
    const dryRunRes = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    if (dryRunRes.effects.status.status === "failure") {
      setLoading(false);
      message.destroy();
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
      <div className="pt-4 text-[40px] text-center">Token Mint</div>
      <div className="text-[16px] text-center text-gray-500">
        Easily Mint more Supply of your Sui Token.
      </div>
      <div className="w-[700px] m-auto mt-5 p-8 bg-white">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            decimals: 9,
            isMetaDataMut: true,
          }}
        >
          <Form.Item
            name="coinAddress"
            label="Token Address"
            rules={[
              { required: true, message: "Please input the Token Address!" },
            ]}
          >
            <Input
              prefix={<SearchOutlined />}
              placeholder="please select"
              onClick={() => setSelectTokenModalVisible(true)}
            />
          </Form.Item>

          <Form.Item
            name="mintAmount"
            label="How much supply you want to mint"
            rules={[
              {
                required: true,
                message: "Please input the number of mint amount!",
              },
            ]}
          >
            <InputNumber
              min={0}
              placeholder="Eg. 1"
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            name="recipient"
            label="recipient"
            rules={[
              { required: true, message: "Please input the recipient Address!" },
            ]}
          >
            <Input placeholder="input the recipient Address" />
          </Form.Item>

          {!account && (
            <div className="text-center mb-6">
              <Button danger size="large">
                Please, Connect Your Wallet
              </Button>
            </div>
          )}
          <Form.Item>
            <div className="mt-6 text-center">
              <Button
                type="primary"
                size="large"
                htmlType="submit"
                disabled={!account || loading}
              >
                Mint Token
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
          setSelectMintCoin(data);
          form.setFieldsValue({ coinAddress: data.address });
          setSelectTokenModalVisible(false);
        }}
      />
    </div>
  );
}
