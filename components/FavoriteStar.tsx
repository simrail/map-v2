import Head from 'next/head'
import Image from 'next/image'
import { Inter } from '@next/font/google'
import styles from '../styles/Home.module.css'
import Link from "next/link";
import { Server } from '../types/Server';
import { MouseEventHandler, useEffect, useState } from 'react';
import { AiFillStar, AiOutlineStar } from "react-icons/ai";
import { ServerSettings } from '../types/ServerSettings';
import { useRouter } from 'next/router';


type FavoriteStarProps = {
    server: Server
}




export default function FavoriteStar(props: FavoriteStarProps) {

    const { server } = props;

    let serverSettings: ServerSettings = JSON.parse(localStorage.getItem('server-' + server.id) ?? '{}');
    const router = useRouter()

    const [favorite, SetFavorite] = useState<boolean>(serverSettings.favorite ?? false)





    const toggleFavorite = (event: MouseEvent) => {
        event.preventDefault()
        serverSettings.favorite = !favorite
        SetFavorite(!favorite)
        localStorage.setItem('server-' + server.id, JSON.stringify(serverSettings))
        router.reload();
    }


    const getStar = (): JSX.Element => {

        if (favorite) {
            return <AiFillStar size={24} color='gold' className={styles.star} onClick={() => toggleFavorite} />
        }
        return <AiOutlineStar size={24} className={styles.star} onClick={() => toggleFavorite} />
    };

    return getStar()
}
