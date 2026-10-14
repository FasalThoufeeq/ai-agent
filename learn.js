const translations = {
    en: {
        title: "Welcome to our website",
        description: "This is our website description.",
        contact: "Contact Us"
    },

    ar: {
        title: "مرحباً بكم في موقعنا",
        description: "هذا وصف موقعنا الإلكتروني.",
        contact: "اتصل بنا"
    }
};

function setLanguage(lang) {

    // Change HTML language and direction
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    // Change all translated elements
    document.querySelectorAll("[data-i18n]").forEach(element => {

        const key = element.dataset.i18n;
        console.log(key,"------------------");
        console.log(translations[lang][key],'++++++++++++++++++++');
        

        if (translations[lang][key]) {
            element.textContent = translations[lang][key];
        }

    });

    // Change language button text
    document.getElementById("langBtn").textContent =
        lang === "ar" ? "English" : "العربية";

    // Save selected language
    localStorage.setItem("language", lang);
}


// Language button
document.getElementById("langBtn").addEventListener("click", () => {

    const currentLanguage =
        localStorage.getItem("language") || "en";

    const newLanguage =
        currentLanguage === "en" ? "ar" : "en";

    setLanguage(newLanguage);

});


// Load saved language
const savedLanguage =
    localStorage.getItem("language") || "en";

setLanguage(savedLanguage);