import React from 'react';

interface HeaderProps {
  title: string;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  onNewEntry: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, searchTerm, setSearchTerm, onNewEntry }) => {
  return (
    <header className="main-header">
      <div className="header-title">
        <h1>{title}</h1>
      </div>
      
      <div className="header-actions">
        <div className="search-bar">
          <span className="search-icon"></span>
          <input 
            type="text" 
            placeholder="Cerca sistemi, utenti..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <button className="btn-primary" onClick={onNewEntry}>
          <span className="btn-icon">+</span> Nuovo Censimento
        </button>
      </div>
    </header>
  );
};

export default Header;
