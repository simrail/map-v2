import { useEffect, useState } from 'react';
import style from '../styles/TopNavigation.module.css';
import { MdIcecream, MdMenu, MdOutlineDarkMode, MdOutlineLightMode, MdSearch } from 'react-icons/md';
import { NavigationDropdown } from './NavigationDropdown';
import { useRouter } from 'next/router';
import { useTheme } from 'contexts/ThemeContext';
// import { NavigationDropdown } from './NavigationDropdown';
import serverTimes from '@/components/serverTimes.json'
import { Spotlight, spotlight, SpotlightActionData } from '@mantine/spotlight';

export const TopNavigation = () => {

    const [serverDate, setServerDate] = useState(new Date());
    const [date, setDate] = useState(new Date());


    const router = useRouter()
    const { id } = router.query

    useEffect(() => {
        if (id) {
            const server = serverTimes.find(server => server.Name === id);
            if (server) {
                const currentHour = date.getUTCHours();
                const newDate = new Date();
                newDate.setHours(currentHour + server.UTCOff);
                setServerDate(newDate);
            }
        }
    }, [id]);

    useEffect(() => {
        let timer = setInterval(() => {
            const newDate = new Date();
            if (id) {
                const server = serverTimes.find(server => server.Name === id);
                if (server) {
                    newDate.setHours(newDate.getUTCHours() + server.UTCOff)
                }
            }
            setDate(newDate)
        }, 1000);
        return function cleanup() {
            clearInterval(timer);
        };
    }, [id]);

    const { theme, setTheme } = useTheme();
    const [dropdown, setDropdown] = useState<boolean>(false);

    const Icon = theme === 'dark' ? MdOutlineLightMode : MdOutlineDarkMode;



    return <div>
        <nav className={style.navigation}>

            <div className={style.left}>
                <MdMenu onClick={() => setDropdown(!dropdown)} className={style.icons} size={24} />
                <img src='/logos/icon.png' alt='SimRail Community Development Logo' width={36} height={36} />
                <h1 className="title" >SimRail Live Map</h1>
                <span className={style.saira}>FR1</span>
                <span className={style.online} />
            </div>
            <div className={style.datetime}>
                <span className={style.time}>{date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={style.date}> {date.toLocaleDateString('fr-FR')}</span>
            </div >
            <div className={style.right}>

                {/* <div className="search-input-container">
                    <input className={[style.searchInput].join(" ")} placeholder='Enter a train number' />
                </div> */}

                <MdSearch onClick={spotlight.open} className={[style.icons, "search_icon"].join(" ")}
                    size={24}
                />
            

                <Icon
                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                    className={style.icons}
                    size={24}
                />

            </div>


        </nav>

        {dropdown && <NavigationDropdown />}
        <style jsx>{`

        .search-input-container {
            border: 2px white solid;
            border-radius: 8px;
            padding: 6px 6px;
        }

        .search_icon {
            display: none;
        }

        .title {
            font-size: 24px;
            font-weight: 800;
            line-height: 1;
            font-family: 'Saira';
        }


        @media (max-width: 1280px) {
            .title {
                display: none;
            }
            .search-input-container {
                display: none;
            }
        }
        `}
        </style>


  

    </div >;
};
