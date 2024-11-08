# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

CREATE COIN
- 删除 Revoke Treasury cap (Immutable)按钮
- 增加提示Coin Decimals 最大最小值，相应的Total Supply

Regulated Coin Deny List
- 增加check address在不在Deny List里面contain_addr_from_deny_list(403, address)

My token
- 浏览自己创建的token

Locks 和vesting还是合在一起 增加线形领取和按周按月
Vest Token放到最上面
- 增加BALANCE显示
- 增加claim类型 线形
- 增加简单模式，只需要输入 2024/11/05 11:24 Set the date and time when the token will be unlocked

参数增加
locker_type vesting lock
claim_type 线性,周 月
interval_duration_ms 自定义时间区间 
线性就是1
week_ms = 7 * 24 * 60 * 60 * 1000;
month_ms = 30 * 24 * 60 * 60 * 1000;  30 days
画图
调整页面逻辑首页 再到菜单
token vesting manager 先注释掉汇总栏

Claim页面增加领取记录
也是graphql， 把NewLocker改为ClaimLocker就可以


分币合币的逻辑