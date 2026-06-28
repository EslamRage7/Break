import { useEffect, useState } from "react";
import Break from "../components/Break";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";

function Home() {
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [gender, setGender] = useState(null);

  let displayName = "";

  if (firstName) {
    if (role === "admin") {
      displayName = gender ? `Mr. ${firstName}` : `Mrs. ${firstName}`;
    } else {
      displayName = gender ? `${firstName} 👋` : `${firstName} 🌸`;
    }
  }

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error } = await supabase
          .from("employees")
          .select("first_name, role, gender")
          .eq("user_id", user.id)
          .single();

        if (error) throw error;
        if (data) {
          setFirstName(data.first_name || "");
          setRole(data.role || "");
          setGender(data.gender);
        }
      } catch (err) {
        console.error(err);
      }
    };

    loadUser();
  }, []);

  return (
    <>
      <div className="dashboard-layout">
        <Sidebar />

        <section className="dashboard-content">
          <div className="settings-panel">
            <div className="settings-header text-capitalize">
              <h1>Welcome{displayName ? `, ${displayName}` : ""} </h1>
            </div>

            <Break />
          </div>
          <Footer />
        </section>
      </div>
    </>
  );
}

export default Home;
