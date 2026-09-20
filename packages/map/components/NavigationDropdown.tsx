import Link from "next/link";
import { AiFillHome, AiOutlineSwap } from "react-icons/ai";

import style from "../styles/TopNavigation.module.css";
// import { saira, sourceCodePro } from 'src/pages/_app';

export const NavigationDropdown = () => {
	return (
		<div id="navigation-menu" className={style.navigationDropdown} role="menu">
			<h2 className={[style.dropdownTitle].join(" ")}>Navigation</h2>
			<div className={[style.dropdownList].join(" ")}>
				<Link
					className={style.dropdownLink}
					href="https://www.simrail.app/"
					role="menuitem"
				>
					<AiFillHome /> Return Home
				</Link>
				<Link className={style.dropdownLink} href="/" role="menuitem">
					<AiOutlineSwap /> Change server
				</Link>
			</div>
		</div>
	);
};
