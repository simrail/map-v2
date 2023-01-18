import Link from 'next/link';
import style from '../styles/FeatureCard.module.css';
import { Saira } from '@next/font/google'
import { Center } from '@mantine/core';
import Image from 'next/image';

type FeatureCardProps = {
    name: string
    href: string
    image: string,
    target?: string,
    disabled?: boolean
}

const saira = Saira({
    weight: '900',
    subsets: ['latin'],
})


export const FeatureCard = ({ name, href, image, target, disabled = false }: FeatureCardProps) => {

    return <Link href={href} target={target} className={[style.link, saira.className, (disabled ? style.linkDisabled : '')].join(" ")}>
        <Image loading={"eager"} src={image} alt={name} style={{ objectFit: "cover" }} width={541} height={150} className={style.image} />
        <Center className={style.title}>{name}</Center>
    </Link>
}
