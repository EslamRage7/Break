import logo from "../assets/logo.png";

export default function Preloader({ isExiting = false }) {
  return (
    <section
      className={`preloader ${isExiting ? "preloader-exit" : ""}`}
      aria-label="Loading BreakApp">
      <div className="preloader-orbit" aria-hidden="true">
        <span className="preloader-ring preloader-ring-one"></span>
        <span className="preloader-ring preloader-ring-two"></span>
        <span className="preloader-ring preloader-ring-three"></span>

        <div className="preloader-logo-wrap">
          <img src={logo} alt="BreakApp" className="preloader-logo" />
        </div>
      </div>

      <div className="preloader-progress" aria-hidden="true">
        <span></span>
      </div>
    </section>
  );
}
