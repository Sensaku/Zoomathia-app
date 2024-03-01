import styles from "./css_modules/SelectComponent.module.css"
import AsyncSelect from 'react-select/async'
import { useEffect, useState, useCallback } from "react"

const SelectComponent = (props) => {
    const [langs, setLangs] = useState([])

    const changeLanguage = useCallback((e) => {
        props.setLanguage(e.target.value)
    }, [props])

    useEffect(() => {
        const callForData = async () => {
            const lang = []
            const data_lang = await fetch("http://localhost:3001/getLanguageConcept").then(response => response.json())
            for (const language of data_lang) {
                lang.push(<option key={language.value} onClick={changeLanguage} value={language.value}>{language.value}</option>)
            }
            setLangs(lang)
        }
        callForData()
    }, [changeLanguage])

    return <section className={styles["input-search"]}>
        <label>Language of Concept</label>
        <select className={styles["select-lang"]}>
            {langs}
        </select>
        <label>{props.filter_title}</label>
        <AsyncSelect
            key={props.key ? props.key : ''}
            className={styles["selection-input"]}
            loadOptions={props.load}
            isMulti
            onChange={props.execute_effect} />
    </section>
}

export default SelectComponent;