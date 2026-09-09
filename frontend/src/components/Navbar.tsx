import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Compass,
  BookOpen,
  Search,
  Highlighter,
  Database,
  HelpCircle,
  Code,
  Layers,
  Info,
  ChevronDown,
  Globe,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react'
import { useI18n } from '../i18n'

interface SubNavItem {
  to: string
  label: string
  desc: string
  icon: LucideIcon
}

interface DropdownGroup {
  id: 'texts' | 'data'
  label: string
  icon: LucideIcon
  activePaths: string[]
  items: SubNavItem[]
}

export const Navbar: React.FC = () => {
  const location = useLocation()
  const { language, setLanguage, t } = useI18n()

  const [openDropdown, setOpenDropdown] = useState<'texts' | 'data' | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fermer les menus déroulants et le menu mobile lors d'un changement d'URL
  useEffect(() => {
    setOpenDropdown(null)
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Fermer lors d'un clic en dehors ou appui sur Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current)
      }
    }
  }, [])

  // Définition des groupes de menus déroulants
  const dropdownGroups: DropdownGroup[] = [
    {
      id: 'texts',
      label: t.nav.textsAndCorpus,
      icon: BookOpen,
      activePaths: [
        '/explore-work',
        '/explore-corpus',
        '/annotate',
        '/corpus-annotation',
        '/ExploreAWork',
        '/ExploreTheCorpus',
      ],
      items: [
        {
          to: '/explore-work',
          label: t.nav.work,
          desc: t.nav.workDesc,
          icon: BookOpen,
        },
        {
          to: '/explore-corpus',
          label: t.nav.corpus,
          desc: t.nav.corpusDesc,
          icon: Search,
        },
        {
          to: '/annotate',
          label: t.nav.annotate,
          desc: t.nav.annotateDesc,
          icon: Highlighter,
        },
      ],
    },
    {
      id: 'data',
      label: t.nav.dataAndSemantics,
      icon: Database,
      activePaths: [
        '/competency-questions',
        '/sparql',
        '/thesaurus-proposals',
        '/CompetencyQuestion',
      ],
      items: [
        {
          to: '/competency-questions',
          label: t.nav.cqs,
          desc: t.nav.cqsDesc,
          icon: HelpCircle,
        },
        {
          to: '/sparql',
          label: t.nav.sparql,
          desc: t.nav.sparqlDesc,
          icon: Code,
        },
        {
          to: '/thesaurus-proposals',
          label: t.nav.thesaurus,
          desc: t.nav.thesaurusDesc,
          icon: Layers,
        },
      ],
    },
  ]

  const handleMouseEnter = (id: 'texts' | 'data') => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current)
    }
    setOpenDropdown(id)
  }

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null)
    }, 150)
  }

  const toggleDropdown = (id: 'texts' | 'data') => {
    setOpenDropdown(current => (current === id ? null : id))
  }

  return (
    <header className="bg-[#1f1d1a] text-[#f4efe6] border-b border-[#3d3730] shadow-md sticky top-0 z-50">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16" ref={navRef}>
          
          {/* Logo et Identité Zoomathia */}
          <Link to="/" className="flex items-center space-x-3 group flex-shrink-0">
            <div className="w-10 h-10 rounded-none bg-[#9A6530] flex items-center justify-center font-serif text-xl font-bold text-white shadow-inner">
              Z
            </div>
            <div>
              <span className="font-serif text-xl tracking-wider font-semibold text-white group-hover:text-[#ddccae] transition-colors">
                ZOOMATHIA
              </span>
              <span className="block text-xs text-[#a39a8c] uppercase tracking-widest -mt-1">
                {t.nav.brandSubtitle}
              </span>
            </div>
          </Link>

          {/* Navigation Bureau */}
          <div className="hidden md:flex items-center space-x-2 lg:space-x-3">
            <nav className="flex items-center space-x-1 lg:space-x-2">
              
              {/* 1. Accueil (Lien direct) */}
              <Link
                to="/"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-none text-sm font-medium transition-all ${
                  location.pathname === '/'
                    ? 'bg-[#9A6530] text-white shadow'
                    : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>{t.nav.home}</span>
              </Link>

              {/* 2 & 3. Groupes déroulants */}
              {dropdownGroups.map(group => {
                const isGroupActive = group.activePaths.includes(location.pathname)
                const isOpen = openDropdown === group.id
                const GroupIcon = group.icon

                return (
                  <div
                    key={group.id}
                    className="relative"
                    onMouseEnter={() => handleMouseEnter(group.id)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDropdown(group.id)}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-none text-sm font-medium transition-all cursor-pointer ${
                        isGroupActive
                          ? 'bg-[#9A6530] text-white shadow'
                          : isOpen
                          ? 'bg-[#2e2a24] text-white'
                          : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                      }`}
                    >
                      <GroupIcon className="w-4 h-4" />
                      <span>{group.label}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 opacity-75 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Panneau déroulant flottant */}
                    {isOpen && (
                      <div className="absolute left-0 top-full pt-1.5 w-80 z-50 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-[#25211c] border border-[#443b32] rounded-none shadow-2xl p-2">
                          <div className="flex flex-col space-y-1">
                          {group.items.map(item => {
                            const isItemActive = location.pathname === item.to
                            const ItemIcon = item.icon
                            return (
                              <Link
                                key={item.to}
                                to={item.to}
                                className={`group flex items-start space-x-3 p-2.5 rounded-none transition-all ${
                                  isItemActive
                                    ? 'bg-[#383129] border-l-2 border-[#9A6530] text-white'
                                    : 'text-[#d6cec0] hover:bg-[#302a23] hover:text-white'
                                }`}
                              >
                                <div
                                  className={`p-2 rounded-none mt-0.5 transition-colors ${
                                    isItemActive
                                      ? 'bg-[#9A6530] text-white'
                                      : 'bg-[#1e1c19] text-[#b3a899] group-hover:bg-[#9A6530] group-hover:text-white'
                                  }`}
                                >
                                  <ItemIcon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium leading-snug">
                                    {item.label}
                                  </div>
                                  <div className="text-xs text-[#a39a8c] mt-0.5 leading-tight line-clamp-2">
                                    {item.desc}
                                  </div>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                )
              })}

              {/* 4. À propos (Lien direct) */}
              <Link
                to="/about"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-none text-sm font-medium transition-all ${
                  location.pathname === '/about'
                    ? 'bg-[#9A6530] text-white shadow'
                    : 'text-[#d6cec0] hover:bg-[#2e2a24] hover:text-white'
                }`}
              >
                <Info className="w-4 h-4" />
                <span>{t.nav.about}</span>
              </Link>
            </nav>

            {/* Sélecteur de langue bilingue FR / EN */}
            <div className="flex items-center bg-[#2c2723] rounded-none p-1 border border-[#453e37] ml-2">
              <Globe className="w-3.5 h-3.5 text-[#a89e90] ml-1.5 mr-1" />
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                className={`px-2 py-1 rounded-none text-xs font-semibold tracking-wider transition-all cursor-pointer ${
                  language === 'fr'
                    ? 'bg-[#9A6530] text-white shadow-xs'
                    : 'text-[#a89e90] hover:text-white'
                }`}
                title="Passer en français"
              >
                FR
              </button>
              <span className="text-[#595045] text-xs px-0.5">|</span>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded-none text-xs font-semibold tracking-wider transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#9A6530] text-white shadow-xs'
                    : 'text-[#a89e90] hover:text-white'
                }`}
                title="Switch to English"
              >
                EN
              </button>
            </div>
          </div>

          {/* Boutons Mobile : Langue + Hamburger */}
          <div className="flex md:hidden items-center space-x-2">
            <div className="flex items-center bg-[#2c2723] rounded-none p-1 border border-[#453e37]">
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                className={`px-2 py-1 rounded-none text-xs font-semibold ${
                  language === 'fr' ? 'bg-[#9A6530] text-white' : 'text-[#a89e90]'
                }`}
              >
                FR
              </button>
              <span className="text-[#595045] text-xs px-0.5">|</span>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded-none text-xs font-semibold ${
                  language === 'en' ? 'bg-[#9A6530] text-white' : 'text-[#a89e90]'
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              aria-label="Toggle mobile menu"
              className="p-2 rounded-none bg-[#2c2723] border border-[#453e37] text-[#d6cec0] hover:text-white hover:bg-[#3d3730] transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Menu Mobile Dépliant */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#3d3730] bg-[#221f1b] px-4 py-4 space-y-4 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          {/* Accueil mobile */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-none text-sm font-medium ${
              location.pathname === '/'
                ? 'bg-[#9A6530] text-white'
                : 'text-[#d6cec0] hover:bg-[#2c2723]'
            }`}
          >
            <Compass className="w-4 h-4 text-[#d6cec0]" />
            <span>{t.nav.home}</span>
          </Link>

          {/* Groupes mobile */}
          {dropdownGroups.map(group => {
            const isGroupActive = group.activePaths.includes(location.pathname)
            const GroupIcon = group.icon
            return (
              <div key={group.id} className="space-y-1 pt-1 border-t border-[#332c25]">
                <div className="flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold text-[#a39a8c] uppercase tracking-wider">
                  <GroupIcon className="w-3.5 h-3.5 text-[#9A6530]" />
                  <span>{group.label}</span>
                </div>
                <div className="space-y-1 pl-2">
                  {group.items.map(item => {
                    const isItemActive = location.pathname === item.to
                    const ItemIcon = item.icon
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-start space-x-3 px-3 py-2 rounded-none text-sm transition-colors ${
                          isItemActive
                            ? 'bg-[#383129] text-white border-l-2 border-[#9A6530]'
                            : 'text-[#d6cec0] hover:bg-[#2c2723]'
                        }`}
                      >
                        <ItemIcon className="w-4 h-4 mt-0.5 text-[#a89e90]" />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-[#a39a8c]">{item.desc}</div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* À propos mobile */}
          <div className="pt-1 border-t border-[#332c25]">
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-none text-sm font-medium ${
                location.pathname === '/about'
                  ? 'bg-[#9A6530] text-white'
                  : 'text-[#d6cec0] hover:bg-[#2c2723]'
              }`}
            >
              <Info className="w-4 h-4 text-[#d6cec0]" />
              <span>{t.nav.about}</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

