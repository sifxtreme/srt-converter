import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ComparisonPage from './components/ComparisonPage';

// Move the existing SubtitleTranslator component to a new file
// and import it here
import SubtitleTranslator from './components/SubtitleTranslator';

const App = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm mb-4">
          <div className="container mx-auto px-4 py-3">
            <div className="flex gap-4">
              <Link to="/">
                <Button variant="ghost">Translate</Button>
              </Link>
              <Link to="/compare">
                <Button variant="ghost">Compare</Button>
              </Link>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<SubtitleTranslator />} />
          <Route path="/compare" element={<ComparisonPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;