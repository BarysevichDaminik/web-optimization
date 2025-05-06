import { BrowserRouter as Router, Routes, Route} from 'react-router-dom';
// import TeamChatPage from './Components/TeamChatPage';
// import AuthComponent from './Components/AuthComponent';
import CombinedChatApp from './Components/AuthAndChatComponent';

function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/*" element={<CombinedChatApp/>}></Route>
        </Routes>
      </Router>
    </div>
  );
}

export default App;
