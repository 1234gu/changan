import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import { router } from '../routes';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#356df3',
          colorInfo: '#356df3',
          colorBgLayout: '#f3f6fb',
          colorText: '#15233d',
          colorTextSecondary: '#66758e',
          borderRadius: 10,
          borderRadiusLG: 14,
          fontFamily: "Inter, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
        },
        components: {
          Card: {
            paddingLG: 20,
          },
          Menu: {
            itemBorderRadius: 8,
            itemHeight: 44,
            itemMarginBlock: 4,
            itemMarginInline: 12,
          },
        },
      }}
    >
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}
