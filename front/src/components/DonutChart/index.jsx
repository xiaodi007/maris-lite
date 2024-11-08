// DonutChart.js
import React from 'react';
import './index.less';

const DonutChart = ({ data, colors }) => {
  const total = data?.reduce((acc, val) => acc + val, 0);
  const percentages = data?.map(value => (value / total) * 100);

  const gradient = `conic-gradient(
    ${colors[0]} ${percentages[0]}%,
    ${colors[1]} ${percentages[0]}% ${percentages[0] + percentages[1]}%
  )`;

  return (
    <div className="donut-chart" style={{ background: gradient }}>
      <div className="donut-hole"></div>
    </div>
  );
};

export default DonutChart;
