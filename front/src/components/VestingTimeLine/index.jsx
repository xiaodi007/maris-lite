import React, { useEffect, useRef, useState } from "react";
import ReactEcharts from "echarts-for-react";
import * as echarts from "echarts";

import { generateClaimSchedule } from "../../pages/home/utils";
import dayjs from "dayjs";

const CLAIM_TYPE_MS = {
  linear: 1,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};
const VestingTimeLine = (props) => {
  const { dataRow } = props || {};
  const [showChart, setShowChart] = useState(false);
  const [legend, setLegend] = useState([]);
  const [category, setCategory] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [cliffDate, setCliffDate] = useState("");

  const chartRef = useRef();
  useEffect(() => {
    initData();
  }, [dataRow]);

  const initData = async () => {
    setShowChart(false);
    const { amount, claimType, startDate, cliffDate, finalDate } =
      dataRow || {};
    if (!startDate || !finalDate) return;
    const _startDate = new Date(startDate);
    const _finalDate = new Date(finalDate);
    const _cliffDate = new Date(cliffDate);
    const data = generateClaimSchedule(
      amount,
      _startDate,
      _cliffDate,
      _finalDate,
      CLAIM_TYPE_MS[claimType]
    );
    const legends = [];
    const dates = [];
    const values = [];

    data?.forEach((item) => {
      const { date, amount } = item || {};
      dates.push(dayjs(date).format("YYYY-MM-DD"));
      values.push(amount);
    });

    const item = data?.find((item) => item?.amount > 0);
    if (startDate !== cliffDate && item) {
      setCliffDate(dayjs(cliffDate).format("YYYY-MM-DD"));
    }
    console.log("item", item);
    setCategory(dates || []);
    setChartData(values || []);
    setShowChart(true);
  };

  const option = {
    grid: {
      left: "8%",
      top: "8%",
      right: "10px",
      bottom: "10%",
    },
    tooltip: {
      trigger: "axis",
    },
    xAxis: {
      type: "category",
      data: category || [],
      axisTick: { show: false },
      axisLine: { show: true, lineStyle: { color: "#eee" } },
      axisLabel: {
        show: true,
        interval: "auto",
        color: "#999",
        fontSize: "12",
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { show: true, color: "#999" },
      axisLine: { show: false, lineStyle: { color: "rgb(23,121,160)" } },
      splitLine: { show: true, lineStyle: { color: "#eee" } },
    },
    series: [
      {
        type: "line",
        // step: "middle",
        name: legend?.[0],
        data: chartData || [],
        smooth: false,
        // symbol: "circle",
        symbolSize: 0,
        lineStyle: { width: 1, color: "#2cb4cd" },
        areaStyle: {
          // 设置区域的渐变颜色
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(44, 180, 205, 0.8)" }, // 顶部的颜色
            { offset: 1, color: "rgba(44, 180, 205, 0)" }, // 底部的颜色
          ]),
        },
        itemStyle: { color: "#0A73FF" },
        // 使用 markLine 绘制垂直线
        markLine: {
          data: [
            {
              name: "Vertical Line",
              xAxis: cliffDate, // 确保 '2024-11-12' 存在于 category 中
              lineStyle: {
                color: "#2cb4cd",
                type: "solid",
                width: 1,
              },
              label: {
                show: true,
                position: "end", // 显示线标签
                color: "#2cb4cd", // 标签颜色
                formatter: "Cliff Date",
              },
            },
          ],
        },
      },
    ],
  };
  return (
    <>
      {showChart && (
        <ReactEcharts
          ref={chartRef}
          option={option}
          style={{ width: "100%", height: "33vh" }}
          className="mb-8"
        />
      )}
    </>
  );
};

export default VestingTimeLine;
