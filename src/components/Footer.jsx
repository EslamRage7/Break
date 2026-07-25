function Footer() {
  return (
    <footer className="app-footer text-center fw-semibold mt-3 pt-2">
       <hr />
      <div className="footer-bottom">
        © {new Date().getFullYear()} Eslam Rageh. All Rights Reserved.
      </div>
    </footer>
  );
}

export default Footer;
