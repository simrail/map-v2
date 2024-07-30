import { Center } from "@mantine/core";
import style from "../styles/FeatureCard.module.css";

type FeatureCardProps = {
	name: string;
	href: string;
	image: string;
	target?: string;
	disabled?: boolean;
};

export const FeatureCard = ({
	name,
	href,
	image,
	target,
	disabled = false,
}: FeatureCardProps) => {
	return (
		<a
			href={href}
			target={target}
			style={{ fontFamily: "Saira" }}
			className={[style.link, disabled ? style.linkDisabled : ""].join(" ")}
		>
			<img
				loading={"eager"}
				src={new URL(image, import.meta.url).href}
				alt={name}
				style={{ objectFit: "cover" }}
				width={541}
				height={150}
				className={style.image}
			/>
			<Center className={style.title}>{name}</Center>
		</a>
	);
};
