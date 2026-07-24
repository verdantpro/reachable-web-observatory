import { Route, Routes } from "react-router-dom";
import TopBar from "./components/TopBar";
import Footer from "./components/Footer";
import Console from "./pages/Console";
import Feed from "./pages/Feed";
import Search from "./pages/Search";
import Stats from "./pages/Stats";
import Signal from "./pages/Signal";
import About from "./pages/About";
import Methodology from "./pages/Methodology";
import Ethics from "./pages/Ethics";
import Data from "./pages/Data";
import Disclosure from "./pages/Disclosure";
import ScanInfo from "./pages/ScanInfo";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <>
      <TopBar />
      <main>
        <Routes>
          <Route path="/" element={<Console />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/search" element={<Search />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/signal/:ip/:port" element={<Signal />} />
          <Route path="/about" element={<About />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/ethics" element={<Ethics />} />
          <Route path="/data" element={<Data />} />
          <Route path="/disclosure" element={<Disclosure />} />
          <Route path="/scan-info" element={<ScanInfo />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
