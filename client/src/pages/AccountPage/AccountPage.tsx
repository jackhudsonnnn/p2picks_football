import React from 'react';
import './AccountPage.css';
import { ProfileCard } from '@components/Social/ProfileCard/ProfileCard';
import { FriendsManager } from '@components/Social/FriendsManager/FriendsManager'

export const AccountPage: React.FC = () => (
  <div className="container account-page">
    <div className="profile-container container-primary">
      <ProfileCard />
      <FriendsManager />
    </div>
  </div>
);
