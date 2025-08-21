import React from 'react';
import './AccountPage.css';
import { ProfileCard, FriendsManager } from '@features/social';

export const AccountPage: React.FC = () => (
  <div className="container account-page">
    <div className="profile-container container-primary">
      <ProfileCard />
      <FriendsManager />
    </div>
  </div>
);
