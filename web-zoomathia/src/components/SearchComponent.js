import styles from "./css_modules/SearchComponent.module.css"
import { useState, useCallback } from "react"
import ParagraphDisplay from './ParagraphComponent'

const BookSection = (props) => {
    return <>
        <section className={styles["selected-book-title"]}>
            <h2>{props.title}</h2>
        </section>
        {props.paragraphs}
    </>
}

const SearchComponent = () => {
    const [searchConceptsList, setSearchConceptsList] = useState([])
    const [paragraphs, setParagraphs] = useState([])

    const searchConcepts = useCallback((e) => {
        const retrieved_concept = []
        const callForData = async () => {
            if (e.target.value === '') {
                setSearchConceptsList([])
            } else {
                const data = await fetch(`http://localhost:3001/searchConcepts?input=${e.target.value}`).then(response => response.json())
                for (const concept of data) {
                    retrieved_concept.push(<option key={concept.uri} value={concept.label}>{concept.label}</option>)
                }
                setSearchConceptsList(retrieved_concept)
            }
        }
        callForData()
    }, [])

    const getParagraphsWithConcept = useCallback((e) => {
        const callForData = async (e) => {
            const concept = document.querySelector("#input-search").value
            const paras = []
            const book_found = {}
            const data = await fetch(`http://localhost:3001/getParagraphsWithConcept?concept=${concept}`)
                .then(response => response.json())
            for (const paragraph of data) {
                if (!book_found.hasOwnProperty(paragraph.bookUri)) {
                    book_found[paragraph.bookUri] = {
                        author: paragraph.author,
                        id: paragraph.bookId,
                        paragraphs: [],
                        title: paragraph.title
                    }
                }
                book_found[paragraph.bookUri]['paragraphs'].push(
                    <ParagraphDisplay
                        key={paragraph.id}
                        id={paragraph.id}
                        text={paragraph.text}
                        uri={paragraph.uri}
                    />
                )
            }
            for (const key of Object.keys(book_found)) {
                paras.push(
                    <BookSection
                        key={key}
                        paragraphs={book_found[key].paragraphs}
                        uri={key}
                        id={book_found[key]['id']}
                        title={`${book_found[key]['title']} - ${book_found[key]["author"]}`}
                    />
                )
            }
            if (data.length === 0) {
                setParagraphs([])
                setParagraphs(<section className={styles["not-found"]}>
                    <p>No result for concept label: {concept}</p>
                </section>
                )
            } else {
                setParagraphs([])
                setParagraphs(paras)
            }
        }
        if (e.key === 'Enter' || e.type === 'click') {
            callForData(e)
        }
    }, [])


    return <div className={styles["box-content"]}>
        <section className={styles["search-title"]}>
            <h1>Search paragraphs for a given concepts</h1>
        </section>
        <section className={styles["input-search"]}>
            <label>Concept input</label>
            <input id="input-search" list='concept_suggestion' onChange={searchConcepts} onKeyDown={getParagraphsWithConcept} />
            <button className={styles["button-search"]} onClick={getParagraphsWithConcept}>Search paragraphs</button>
            <datalist id='concept_suggestion'>
                {searchConceptsList}
            </datalist>
        </section>
        {paragraphs}
    </div>

}

export default SearchComponent;