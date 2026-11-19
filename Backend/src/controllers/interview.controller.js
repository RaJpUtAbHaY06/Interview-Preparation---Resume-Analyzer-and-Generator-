const pdfParse = require("pdf-parse")
const path = require("node:path")
const {generateInterviewReport, generateResumePdf} = require("../services/ai.service")
const interviewReportModel = require("../models/interviewReport.model")

/**
 * @description Controller to generate interview report on the basis of user self description , resume pdf and job description
 */

async function generateInterviewReportController(req,res){
    
    const parser = new pdfParse.PDFParse({
        data: Uint8Array.from(req.file.buffer),
        standardFontDataUrl: path.join(__dirname, "../../node_modules/pdfjs-dist/standard_fonts/")
    })
    const resumeContent = await parser.getText()
    await parser.destroy()
    const {selfDescription, jobDescription} = req.body

    const interviewReportByAi = await generateInterviewReport({
        resume: resumeContent.text,
        selfDescription,
        jobDescription
    })
    const interviewReport = await interviewReportModel.create({
        user: req.user.id,
        resume:resumeContent.text,
        selfDescription,
        jobDescription,
        ...interviewReportByAi,
        title: interviewReportByAi.title || req.body.title || "Interview Report"
    })
    res.status(201).json({
        message:"Interview report generated successfully",
        interviewReport
    })
}

async function getInterviewReportByIdController(req,res){
    const {interviewId} = req.params
    const interviewReport = await interviewReportModel.findOne({_id:interviewId,user:req.user.id})
    if(!interviewReport){
        return res.status(404).json({message:"Interview report not found"})
    }
    res.status(200).json({
        message:"Interview report fetched successfully",
        interviewReport
    })
}

/**
 * @description Controller to get all interview reports of logged in user
 */
async function getAllInterviewReportsController(req,res){
    const interviewReports = await interviewReportModel.find({user:req.user.id}).sort({createdAt:-1}).select("-resume -selfDescription -jobDescription -_v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")
     res.status(200).json({
        message:"Interview reports fetched successfully",
        interviewReports
     })
}

/**
 * @description Controller to generate pdf of interview report on the basis of user self description , resume pdf and job description
 */
async function generateResumePdfController(req,res){
    try{
        const {interviewReportId} = req.params
        const interviewReport = await interviewReportModel.findById(interviewReportId)

        if(!interviewReport){
            return res.status(404).json({message:"Interview report not found"})
        }

        const {resume,selfDescription,jobDescription} = interviewReport
        const pdfBuffer = await generateResumePdf({resume, jobDescription, selfDescription})

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`
        })
        res.send(pdfBuffer)
    }catch(error){
        console.error("Resume PDF generation failed:", error.message)
        res.status(502).json({message:"Resume generation is temporarily unavailable. Please try again."})
    }
}

module.exports = {generateInterviewReportController,getInterviewReportByIdController,getAllInterviewReportsController,generateResumePdfController}