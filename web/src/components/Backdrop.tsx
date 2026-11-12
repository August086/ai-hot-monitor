/**
 * 全局氛围层：墨色网格 + 两团信号光晕 + 轻扫描线。
 * 粒子动画已移除，避免与 Hero 的 Beams 叠加造成首屏负担。
 */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__grid" />
      <div className="backdrop__glow backdrop__glow--cyan" />
      <div className="backdrop__glow backdrop__glow--magenta" />
      <div className="backdrop__scan" />
      <div className="backdrop__noise" />
    </div>
  );
}
