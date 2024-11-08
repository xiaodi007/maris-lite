import React, { useState } from "react";
import { FileOutlined, FireFilled, TransactionOutlined,LockOutlined } from "@ant-design/icons";
import { Layout, Menu, theme, Popover } from "antd";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";
import WormholeConnect from "@wormhole-foundation/wormhole-connect";

import "./index.less";
import CreateToken from "./components/CreateToken";
import TokenMint from "./components/TokenMint";
import UpdateMetadata from "./components/UpdateMetadata";
import RevokeAuthority from "./components/RevokeAuthority";
import UpdateAddress from "./components/UpdateAddress";
import VestCreate from "./components/VestCreate";
import VestManager from "./components/VestManager";
import VestClaim from "./components/VestClaim";
import WormholeModal from "../../components/WormholeModal";

const { Header, Content, Footer, Sider } = Layout;

function getItem(label, key, icon, children) {
  return {
    key,
    icon,
    children,
    label,
    style: {
      marginBottom: 18,
    },
  };
}

// Define your menu items
const items = [
  getItem("Token Manager", "/app/token-manager", <TransactionOutlined />, [
    getItem("Create Token", "/app/token-manager/create-token"),
    getItem("Token Mint", "/app/token-manager/token-mint"),
    getItem("Update Token Metadata", "/app/token-manager/update-metadata"),
    getItem("Revoke Authority", "/app/token-manager/revoke-auth"),
    getItem("Regulated Coin Deny List", "/app/token-manager/regcoin"),
  ]),
  getItem("Vesting & Lock Tokens", "/vest-lock", <LockOutlined />, [
    // getItem("Token Locks", "/app/toekn", null, [
    //   getItem("Creator", "/app/lock/create"),
    //   getItem("Manager", "/app/lock/manager"),
    // ]),

      getItem("Creator", "/app/vest/create"),
      getItem("Manager", "/app/vest/manager"),

    // getItem("Vesting & Lock", "/app/vest", null, [
    //   getItem("Creator", "/app/vest/create"),
    //   getItem("Manager", "/app/vest/manager"),
    // ]),
    getItem("Claim", "/app/vest/claim"),
    // getItem("Revoke Freeze Authority", "/token-manager/revoke-auth"),
    // getItem("Regcoin Add Remove Deny Address", "/token-manager/regcoin"),
  ]),
];

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [openWormhole, setOpenWormhole] = useState(false);
  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();

  // Keep the current path selected in the menu
  const selectedKey = location.pathname;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        breakpoint="lg"
        // collapsedWidth="0"
        theme="light"
        width={300}
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
      >
        <div
          className="py-5 flex justify-center items-center"
          onClick={() => navigate("/")}
        >
          <FireFilled
            style={{ marginRight: 6, color: "#2cb4cd", fontSize: 32 }}
          />
          <span className="text-[26px] text-gray-950 font-bold">Maris</span>
        </div>
        <Menu
          selectedKeys={[selectedKey]} // Set selected key based on current path
          mode="inline"
          defaultMotions
          defaultOpenKeys={["/app/token-manager"]}
          items={items}
          onClick={(e) => navigate("" + e.key)} // Handle navigation on menu click
        />
      </Sider>
      <Layout>
        <div className="absolute right-5 top-3 flex items-center">
          <Popover
            content={
              <div className="bg-black">
                <WormholeConnect theme={{ background: "#2cb4cd" }} />
              </div>
            }
            title="Title"
            trigger="hover"
          >
            <div className="mr-3 px-3 py-[10px] rounded-md text-[#2cb4cd] cursor-pointer">
              WormholeConnect
            </div>
          </Popover>
          <ConnectButton
            connectText="CONNECT WALLET"
            style={{ background: "#2cb4cd", color: "white", boxShadow: "none" }}
          />
        </div>
        <Header
          style={{ background: colorBgContainer, padding: "40px 0" }}
        ></Header>
        <Content style={{ height: "calc(100vh - 80px)", overflowY: "auto" }}>
          {/* Only Content area changes based on route */}
          <Routes>
            <Route path="/app" element={<div>Welcome to Maris</div>} />
            {/* token-manager */}
            <Route
              path="/token-manager/create-token"
              element={<CreateToken />}
            />
            <Route path="/token-manager/token-mint" element={<TokenMint />} />
            <Route
              path="/token-manager/update-metadata"
              element={<UpdateMetadata />}
            />
            <Route
              path="/token-manager/revoke-auth"
              element={<RevokeAuthority />}
            />
            <Route path="/token-manager/regcoin" element={<UpdateAddress />} />
            {/* vest lock */}
            <Route path="/vest/create" element={<VestCreate />} />
            <Route path="/vest/manager" element={<VestManager />} />
            <Route path="/vest/claim" element={<VestClaim />} />
          </Routes>
        </Content>
        <Footer style={{ textAlign: "center" }}>
          Ant Design ©{new Date().getFullYear()} Created by Ant UED
        </Footer>
      </Layout>
      <WormholeModal
        visible={openWormhole}
        onClose={() => setOpenWormhole(false)}
      />
    </Layout>
  );
};

export default App;
