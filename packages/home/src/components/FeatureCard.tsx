import style from "../styles/FeatureCard.module.css";

type FeatureCardProps = {
	name: string;
	label: string;
	description: string;
	actionLabel: string;
	href: string;
	image: string;
	target?: "_blank";
	disabled?: boolean;
	priority?: boolean;
};

export const FeatureCard = ({
	name,
	label,
	description,
	actionLabel,
	href,
	image,
	target,
	disabled = false,
	priority = false,
}: FeatureCardProps) => {
	const content = (
		<>
			<div className={style.imageWrap}>
				<img
					loading={priority ? "eager" : "lazy"}
					fetchPriority={priority ? "high" : "auto"}
					src={new URL(image, import.meta.url).href}
					alt=""
					width={903}
					height={408}
					className={style.image}
				/>
				<span className={style.cardIndex}>
					{priority ? "01" : name === "EDR" ? "02" : "03"}
				</span>
			</div>
			<div className={style.content}>
				<span className={style.label}>{label}</span>
				<h3>{name}</h3>
				<p>{description}</p>
				<span className={style.cta}>
					{actionLabel}
					{!disabled && <span aria-hidden="true">→</span>}
				</span>
			</div>
		</>
	);

	if (disabled) {
		return (
			<article
				className={`${style.card} ${style.disabled}`}
				aria-disabled="true"
			>
				{content}
			</article>
		);
	}

	return (
		<a
			href={href}
			target={target}
			rel={target === "_blank" ? "noreferrer" : undefined}
			className={style.card}
			aria-label={`Open ${name}`}
		>
			{content}
		</a>
	);
};
