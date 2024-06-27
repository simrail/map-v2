import { useEffect, useState } from 'react';
import style from '../styles/TopNavigation.module.css'
import { Saira } from 'next/font/google';
import { MdDarkMode, MdLightMode, MdMenu } from "react-icons/md";
import Image from 'next/image';
import { useRouter } from 'next/router';

const saira = Saira({
    weight: ['400', '900'],
    subsets: ['latin'],
})

export default function TopNavigation() {


    var [date, setDate] = useState(new Date());

    useEffect(() => {
        var timer = setInterval(() => setDate(new Date()), 1000)

        return function cleanup() {
            clearInterval(timer)
        }

    });

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    const router = useRouter()
    const { id } = router.query



    const [theme, setTheme] = useState('light')

    const toggleTheme = () => {
        let newTheme = (theme === 'light' ? 'dark' : 'light')
        setTheme(newTheme);
        document.body.className = newTheme;

        localStorage.removeItem('theme')
        localStorage.setItem('theme', newTheme)
    }

    let ThemeIcon = (theme === 'light' ? MdLightMode : MdDarkMode)

    return <div className={style.main}>
        <div className={style.left + ' ' + saira.className}>
            <MdMenu onClick={() => router.push('/servers')} className={style.icon} />
            <img className={style.icon} src="/logos/simrail-dev-icon.png" />
            <div className={style.logoAndServer}>
                <h1 className={style.title}>Simrail Live Map</h1>
                <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px'}}>
                    <span className={style.serverId}>{id.toUpperCase()}</span>
                    <span className={style.onlineIndicator}></span>
                </div>
            </div>
        </div>
        <div className={style.datetime}>
            <span className={style.time}>{hours}:{minutes}</span>
            <span className={style.date}>{date.toLocaleDateString()}</span>
        </div>
        <div className={style.right}>

            <ThemeIcon onClick={toggleTheme} className={style.icon} />

        </div>
    </div >

}