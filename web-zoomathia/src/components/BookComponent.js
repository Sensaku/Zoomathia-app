import { useLayoutEffect, useState, useCallback } from 'react'
import styles from "./css_modules/BookComponents.module.css"
import ParagraphDisplay from './ParagraphComponent'

const BookPage = () => {

    const [books, setBooks] = useState([])
    const [paragraphs, setParagraphs] = useState([])
    const [title, setTitle] = useState()
    const [searchConceptsList, setSearchConceptsList] = useState([])
    const [currentBookUri, setCurrentBookUri] = useState('')
    const [authorList, setAuthorList] = useState([])
    const [works, setWorks] = useState([]);

    const getParagraph = useCallback((e) => {
        const paras = []
        setParagraphs([])
        const callForData = async () => {
            const data = await fetch(`http://localhost:3001/getParagraphs?uri=${e.target.id}`).then(response => response.json())

            for (const paragraph of data) {
                paras.push(
                    <ParagraphDisplay key={paragraph.id} id={paragraph.id} text={paragraph.text} uri={paragraph.uri} />
                )
            }
            setTitle(`Naturalis Historia - ${e.target.getAttribute('number')}`)
            setParagraphs(paras)
            setCurrentBookUri(e.target.id)
        }
        callForData()
    }, [])

    const getParagraphWithConcept = useCallback((e) => {
        const callForData = async (e) => {
            const paras = []
            const data = await fetch(`http://localhost:3001/getParagraphWithConcept?concept=${e.target.value}&uri=${currentBookUri}`).then(response => response.json())
            for (const paragraph of data) {
                paras.push(<ParagraphDisplay key={paragraph.id} id={paragraph.id} text={paragraph.text} uri={paragraph.uri} />)
            }
            setParagraphs([])
            setParagraphs(paras)
        }
        if (e.key === 'Enter') {
            callForData(e)
        }
    }, [currentBookUri])

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

    const getBookList = useCallback(() => {
        let bookList = [<option></option>];
        const callForData = async () => {
            const data = await fetch("http://localhost:3001/getBookList").then(response => response.json())
            for (const book of data) {
                bookList.push(<option key={book.uri} id={book.uri} onClick={getParagraph} number={book.id}>{book.id}</option>)
            }
            //setBooks(bookList)
            setBooks(<section className={styles["book-section"]}>
                <h1>Select book</h1>
                <select>
                    {bookList}
                </select>
            </section>)
        }

        callForData()
    }, [getParagraph])

    const getWorks = useCallback((e) => {
        const workList = [<option></option>]
        const callForData = async () => {
            const data = await fetch(`http://localhost:3001/getWorks?author=${e.target.getAttribute("name")}`).then(response => response.json())
            for (const work of data) {
                workList.push(<option value={work.uri} onClick={getBookList}>{work.title}</option>)
            }
            setWorks(<section>
                <h1>Choose a work</h1>
                <select>
                    {workList}
                </select>
            </section>)
        }
        callForData()
    }, [getBookList])

    useLayoutEffect(() => {
        const author_response = [<option></option>]
        const callForData = async () => {
            const data = await fetch("http://localhost:3001/getAuthors").then(response => response.json())
            for (const author of data) {
                author_response.push(<option key={author.name} onClick={getWorks} name={author.name}>{author.name}</option>)
            }
            setAuthorList(<section className={styles["author-section"]}>
                <h1>Select author</h1>
                <select>
                    {author_response}
                </select>

            </section>)
        }
        callForData()
    }, [getWorks])

    return <div className={styles["box-content"]}>
        <header className={styles["selection-section"]}>
            {authorList}
            {works}
            {books}
        </header>


        <header className={styles["selected-book-title"]}>
            <h2>{title}</h2>
        </header>
        {paragraphs.length > 0 ? <section className={styles["input-search"]}>
            <label>Filter paragraph with concept</label>
            <input list='concept_suggestion' onChange={searchConcepts} onKeyDown={getParagraphWithConcept} />
            <datalist id='concept_suggestion'>
                {searchConceptsList}
            </datalist>
        </section> : <></>}

        {paragraphs}
    </div>
}

export default BookPage;