import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import "./Navbar.css";

// Import icons
import PublicTablesIcon from "../../assets/PublicTablesIcon.png";
import PrivateTablesIcon from "../../assets/PrivateTablesIcon.png";
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
                <Link to="/public-tables" className="nav-link">
                  <img
                    src={PublicTablesIcon}
                    alt="Public Tables"
                    className="nav-icon"
                  />
                  <span className="nav-text">Tables</span>
                </Link>
                <Link to="/private-tables" className="nav-link">
                  <img
                    src={PrivateTablesIcon}
                    alt="Private Tables"
                    className="nav-icon"
                  />
                  <span className="nav-text">Tables</span>
                </Link>
                <Link to="/bets-history" className="nav-link">
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
