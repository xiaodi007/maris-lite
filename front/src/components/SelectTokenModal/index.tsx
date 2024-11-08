// ModalWithTable.js
import React, { useState } from 'react';
import { Modal, Table, Button } from 'antd';

const SelectTokenModal = ({ visible, onClose, data, onSelect }) => {
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const columns = [
        {
            title: 'Address',
            dataIndex: 'address',
            key: 'address',
            render: (text) => {
                return text?.slice(0, 20) + '.........' + text?.slice(-20);
            }
        },
        // Add more columns as needed
    ];

    const rowSelection: any = {
        type: 'radio', // Set to single selection
        selectedRowKeys,
        onChange: (selectedRowKeys, selectedRows) => {
            setSelectedRowKeys([selectedRows[0]?.address]);
        },
    };

   // 为每一行绑定点击事件
  const onRow = (record) => ({
    onClick: () => {
        setSelectedRowKeys([record?.address]); // 单选，只保留当前选中的行
    },
  });

    const handleConfirm = () => {
        const row = data?.find((item) => item?.address === selectedRowKeys?.[0]);
        onSelect(row); // Send selected row data back to the parent component
        onClose(); // Close the modal
    };

    return (
        <Modal
            title="Select an Item"
            visible={visible}
            onCancel={onClose}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    Cancel
                </Button>,
                <Button
                    key="confirm"
                    type="primary"
                    onClick={handleConfirm}
                    disabled={!selectedRowKeys?.length}
                >
                    Confirm
                </Button>,
            ]}
        >
            <Table
                columns={columns}
                dataSource={data || []}
                rowSelection={rowSelection}
                onRow={onRow}
                rowKey={(record) => record?.address}
                pagination={false}
            />
        </Modal>
    );
};

export default SelectTokenModal;
