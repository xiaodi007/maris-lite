import React, { useState } from "react";
import { Button } from "antd";
import "./index.less"; // 样式文件

const ToggleSwitch = ({ options, onChange }) => {
  const [selected, setSelected] = useState(options[0]?.value); // 默认选择第一个

  const handleToggle = (value) => {
    setSelected(value);
    onChange(value); // 将选中值返回给父组件
  };

  return (
    <div className="toggle-switch">
      <div className=" px-6 py-2 inline-block bg-[#EEF3FC]">
        {options?.map((option) => (
          <Button
            key={option.value}
            className={`toggle-button ${
              selected === option.value ? "active" : ""
            }`}
            onClick={() => handleToggle(option.value)}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default ToggleSwitch;
