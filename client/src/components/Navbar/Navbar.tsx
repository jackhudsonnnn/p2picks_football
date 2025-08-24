import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@features/auth";
import "./Navbar.css";

import TablesIcon from "../../assets/TablesIcon.png";
import TicketsIcon from "../../assets/TicketsIcon.png";
import AccountIcon from "../../assets/AccountIcon.png";

export const Navbar: React.FC = () => {
  const { user, signOut, signInWithGoogle } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          P2Picks
        </Link>

        <div className="navbar-menu">
          <div className="navbar-links">
            {user && (
              <>
                <Link to="/account" className="nav-link">
                  <img src={AccountIcon} alt="Account" className="nav-icon" />
                  <span className="nav-text">Account</span>
                </Link>
                <Link to="/tables" className="nav-link">
                  <img
                    src={TablesIcon}
                    alt="Tables"
                    className="nav-icon"
                  />
                  <span className="nav-text">Tables</span>
                </Link>
                <Link to="/tickets" className="nav-link">
                  <img src={TicketsIcon} alt="Tickets" className="nav-icon" />
                  <span className="nav-text">Tickets</span>
                </Link>
              </>
            )}
          </div>

          <div className="navbar-auth">
            {user ? (
              <button className="btn-sign-out" onClick={signOut}>
                Logout
              </button>
            ) : (
              <button className="btn-sign-out" onClick={signInWithGoogle}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
