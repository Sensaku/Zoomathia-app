import { useLayoutEffect, useState, useCallback } from 'react'
import styles from "./css_modules/BookComponents.module.css"
import ParagraphDisplay from './ParagraphComponent'
import SelectComponent from './SelectComponent'

const BookPage = () => {

    const [books, setBooks] = useState([])
    const [paragraphs, setParagraphs] = useState([])
    const [title, setTitle] = useState()
    const [currentBookUri, setCurrentBookUri] = useState('')
    const [authorList, setAuthorList] = useState([])
    const [works, setWorks] = useState([]);
    const [currentLang, setCurrentLang] = useState('en')

    const getParagraph = useCallback((e) => {
        const paras = []
        setParagraphs([])
        const callForData = async () => {
            const data = await fetch(`${process.env.BACKEND_URL}getParagraphs?uri=${e.target.id}`).then(response => response.json())
            let title = ''
            for (const paragraph of data) {
                title = paragraph.title
                paras.push(
                    <ParagraphDisplay key={paragraph.id} id={paragraph.id} text={paragraph.text} uri={paragraph.uri} lang={currentLang} />
                )
            }
            setTitle(`${title}`)
            setParagraphs(paras)
            setCurrentBookUri(e.target.id)
        }
        callForData()
    }, [currentLang])

    const postParagraphWithConcepts = useCallback((e) => {

        const callForData = async (e) => {
            const paras = []
            const data = await fetch(
                `${process.env.BACKEND_URL}getParagraphWithConcept`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ uri: currentBookUri, concepts: e })
                }).then(response => response.json())

            for (const paragraph of data) {
                paras.push(<ParagraphDisplay key={paragraph.id} id={paragraph.id} text={paragraph.text} uri={paragraph.uri} lang={currentLang} />)
            }

            if (paras.length === 0) {
                setParagraphs(<p className={styles["no-result"]}>No paragraphs</p>)
            } else {
                setParagraphs([])
                setParagraphs(paras)
            }

        }
        callForData(e)
    }, [currentBookUri, currentLang, setParagraphs])

    const searchConcepts = async (input) => {
        const retrieved_concept = []
        const callForData = async (input) => {
            if (input === '') {
                return []
            } else {
                const data = await fetch(`${process.env.BACKEND_URL}searchConcepts?input=${input}&lang=${currentLang}`).then(response => response.json())
                for (const concept of data) {
                    retrieved_concept.push({ value: concept.uri, label: `${concept.label}@${currentLang}` })
                }
                return retrieved_concept
            }
        }
        return await callForData(input)
    }

    const getBookList = useCallback(() => {
        let bookList = [<option></option>];
        const callForData = async () => {
            const data = await fetch(`${process.env.BACKEND_URL}getBookList`).then(response => response.json())
            for (const book of data) {
                bookList.push(<option key={book.uri} id={book.uri} onClick={getParagraph} number={book.id}>{book.id}</option>)
            }
            //setBooks(bookList)
            setBooks(<section className={styles["book-section"]}>
                <h2>Select book</h2>
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
            const data = await fetch(`${process.env.BACKEND_URL}getWorks?author=${e.target.getAttribute("name")}`).then(response => response.json())
            for (const work of data) {
                workList.push(<option value={work.uri} onClick={getBookList}>{work.title}</option>)
            }
            setWorks(<section>
                <h2>Work</h2>
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
            const data = await fetch(`${process.env.BACKEND_URL}getAuthors`).then(response => response.json())
            for (const author of data) {
                author_response.push(<option key={author.name} onClick={getWorks} name={author.name}>{author.name}</option>)
            }

            setAuthorList(<section className={styles["author-section"]}>
                <h2>Author</h2>
                <select>
                    {author_response}
                </select>
            </section>)
        }
        callForData()
    }, [getWorks, postParagraphWithConcepts])

    return <div className={styles["box-content"]}>
        <header className={styles["selection-section"]}>
            {authorList}
            {works}
            {books}
        </header>


        <header className={styles["selected-book-title"]}>
            <h2>{title}</h2>
        </header>

        {currentBookUri !== '' ? <SelectComponent
            key={currentBookUri}
            execute_effect={postParagraphWithConcepts}
            filter_title="Filter paragraph with concept"
            load={searchConcepts}
            setLanguage={setCurrentLang}
        /> : <></>}
        {paragraphs}
    </div>
}

export default BookPage;