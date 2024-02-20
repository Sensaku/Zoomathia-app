import styles from './Navbar.module.css'
import { Outlet, Link } from 'react-router-dom'

const Navbar = () => {
    return <>
        <nav className={styles['navbar']}>
            <div className={styles["logo-box"]}>

            </div>
            <div className={styles["menu-box"]}>
                <Link to='/' >Home</Link>
                <Link to='/Search'>Search</Link>
                <Link to='/Book'>Book</Link>
            </div>
        </nav>

        <Outlet />
    </>

}

export default Navbar;