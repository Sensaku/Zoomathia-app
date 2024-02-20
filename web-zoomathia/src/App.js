import './App.css';
import BookPage from './components/BookComponent';
import SearchPage from './components/SearchComponent';
import Navbar from './components/page/Navbar';
import Footer from './components/page/Footer';
import Home from './components/page/Home';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path='/' element={<Home />} />
        <Route index element={<Home />} />
        <Route path='Book' element={<BookPage />} />
        <Route path='Search' element={<SearchPage />} />
      </Routes>
      <Footer />
    </BrowserRouter>

  );
}

export default App;
