import { useEffect, useState } from 'react';
import style from '../styles/TopNavigation.module.css';
import { AiFillHome, AiOutlineSwap } from 'react-icons/ai';
import Link from 'next/link';
// import { saira, sourceCodePro } from 'src/pages/_app';




export const NavigationDropdown = () => {

    return <div className={style.navigationDropdown}>
        <h2 className={[style.dropdownTitle].join(" ")}>Navigation</h2>
        <div className={[style.dropdownList].join(' ')}>
        {/* <div className={[style.dropdownList, ].join(' ')}> */}
            <Link className={style.dropdownLink} href="https://www.simrail.app/"><AiFillHome /> Return Home</Link>
            <Link className={style.dropdownLink} href="https://www.simrail.app/servers"><AiOutlineSwap /> Change server</Link>
        </div>
        {/* <h2 className={[style.dropdownTitle].join(" ")}>Layer</h2>
        <fieldset>
           <div className={[style.checkboxContainer, ].join(' ')}>
               <input className={style.checkbox} type="checkbox" id="scales" name="scales" />
               <label for="scales">Trains</label>
           </div>
           <div className={[style.checkboxContainer, ].join(' ')}>
               <input type="checkbox" id="horns" name="horns" />
               <label for="horns">Dispatch Stations</label>
           </div>
           <div className={[style.checkboxContainer, ].join(' ')}>
               <input type="checkbox" id="horns" name="s" />
               <label for="s">Unplayable dispatch stations</label>
           </div>
        </fieldset> */}

    </div>;
};
