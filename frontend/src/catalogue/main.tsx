import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { Catalogue } from './Catalogue'

// Developer page, served by `npm run dev` at /catalogue.html. Not part of the production build.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Catalogue />
  </React.StrictMode>,
)
