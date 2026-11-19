const {GoogleGenAI, Behavior} = require("@google/genai")
const {z} = require("zod")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    httpOptions: { timeout: 45000 }
})

async function generateContentWithRetry(request, maxAttempts = 3, modelFallbacks){
    const models = modelFallbacks || (request.model === "gemini-3.8-flash"
        ? ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]
        : [request.model])
    let lastError

    for(const model of models){
        for(let attempt = 1; attempt <= maxAttempts; attempt++){
            try{
                return await ai.models.generateContent({...request, model})
            }catch(error){
                lastError = error
                const isNetworkFailure = error instanceof TypeError && error.message === "fetch failed"
                const isDeadlineExceeded = error.status === 504 || /DEADLINE_EXCEEDED/i.test(error.message)
                if(isDeadlineExceeded){
                    break
                }
                const isTemporary = error.status === 503 || error.status === 429 || isNetworkFailure
                if(!isTemporary){
                    throw error
                }
                if(attempt < maxAttempts){
                    await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** (attempt - 1))))
                }
            }
        }
    }

    throw lastError
}


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 to 100 indicating how well the candidate's profile matches the job description"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The Technical question can be asked in the interview"),
        intention: z.string().describe("The Intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer the question, what points to cover and what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention of asking that question and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The Technical question can be asked in the interview"),
        intention: z.string().describe("The Intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer the question, what points to cover and what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention of asking that question and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low","medium","high"]).describe("The severity of this skill gap,i.e. how important is this skill for the job describe")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The number of days in the preparation starting from day 1"),
        focus: z.string().describe("The main focus off this day in the preparation plan, e.g. data structure, sysyem design,mock interview etc"),
        tasks: z.array(z.string()).describe("List of tasks to be done this day to follow the preparation plan, e.g. read a specific book or practice certain skill")
    })).describe("A day-wise preparation plan for the candidate to follow in order to get prepared for the interview effectively"),
    title: z.string().describe("The title of the job which the interview report is generated"),

})
async function generateInterviewReport({resume,selfDescription,jobDescription}){
    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}`
    const response = await generateContentWithRetry({
        model: "gemini-3.8-flash",
        contents:prompt,
        config:{
            responseMimeType:"application/json",
            responseSchema: z.toJSONSchema(interviewReportSchema)
        }
    })
    return JSON.parse(response.text)
}
async function generatePdfFromHtml(htmlContent){
    const browser = await puppeteer.launch()
    try{
        const page = await browser.newPage()
        await page.setContent(htmlContent, {waitUntil: "domcontentloaded", timeout: 30000})

        return await page.pdf({format: "A4",margin:{
            top:"20mm",
            bottom:"20mm",
            left:"15mm",
            right:"15mm"
        }})
    }finally{
        await browser.close()
    }
}

async function generateResumePdf({resume, selfDescription, jobDescription}){
    const resumepdfSchema = z.object({
        html: z.string().describe("The html content of the resume pdf to be generated")
    })
    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `
    const response = await generateContentWithRetry({
        model: "gemini-3.8-flash",
        contents:prompt,
        config:{
            responseMimeType:"application/json",
            responseSchema: z.toJSONSchema(resumepdfSchema)
        }
    }, 1, ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"])
    
    const jsonContent =  JSON.parse(response.text)
    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer
}
module.exports = {generateInterviewReport, generateResumePdf}