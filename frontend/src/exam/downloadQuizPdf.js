const PAGE_MARGIN = 18;
const PAGE_BOTTOM = 279;

function safeFilename(value) {
  const withoutControlCharacters = Array.from(String(value || 'exam'))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');
  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'exam';
}

export async function downloadQuizPdf(quiz, answers = [], result = null) {
  if (!quiz?.questions?.length) {
    throw new Error('There are no quiz questions to download.');
  }

  const { jsPDF } = await import('jspdf');
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (PAGE_MARGIN * 2);
  let y = PAGE_MARGIN;

  const ensureSpace = (height) => {
    if (y + height <= PAGE_BOTTOM) return;
    document.addPage();
    y = PAGE_MARGIN;
  };

  const writeLines = (text, options = {}) => {
    const {
      fontSize = 10,
      fontStyle = 'normal',
      indent = 0,
      gapAfter = 2,
      color = [23, 32, 51],
    } = options;
    document.setFont('helvetica', fontStyle);
    document.setFontSize(fontSize);
    document.setTextColor(...color);
    const lines = document.splitTextToSize(String(text ?? ''), contentWidth - indent);
    const lineHeight = fontSize * 0.42;
    ensureSpace((lines.length * lineHeight) + gapAfter);
    document.text(lines, PAGE_MARGIN + indent, y);
    y += (lines.length * lineHeight) + gapAfter;
  };

  document.setFillColor(23, 107, 85);
  document.rect(0, 0, pageWidth, 34, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(19);
  document.text('Generated MCQ Exam', PAGE_MARGIN, 16);
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.text(`${quiz.lessonName || 'Lesson'} - Unit ${quiz.unitNo ?? '-'}`, PAGE_MARGIN, 25);
  y = 44;

  if (result) {
    writeLines(`Score: ${result.score}/${result.total}`, {
      fontSize: 12,
      fontStyle: 'bold',
      color: [21, 88, 68],
      gapAfter: 6,
    });
  }

  quiz.questions.forEach((question, questionIndex) => {
    const checkedResult = result?.results?.[questionIndex];
    ensureSpace(28);
    writeLines(`${questionIndex + 1}. ${question.question}`, {
      fontSize: 11,
      fontStyle: 'bold',
      gapAfter: 2,
    });

    question.options.forEach((option, optionIndex) => {
      const letter = String.fromCharCode(65 + optionIndex);
      writeLines(`${letter}. ${option}`, { indent: 5, gapAfter: 1.5 });
    });

    if (checkedResult) {
      const selectedAnswer = answers[questionIndex] || 'Not answered';
      writeLines(
        `Your answer: ${selectedAnswer}   |   Correct answer: ${checkedResult.correctAnswer}`,
        {
          fontSize: 9,
          fontStyle: 'bold',
          indent: 5,
          color: checkedResult.correct ? [21, 88, 68] : [156, 38, 50],
          gapAfter: 1,
        }
      );
      if (checkedResult.explanation) {
        writeLines(`Explanation: ${checkedResult.explanation}`, {
          fontSize: 9,
          indent: 5,
          color: [71, 85, 105],
          gapAfter: 2,
        });
      }
    }

    y += 3;
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(100, 116, 139);
    document.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, 290, { align: 'right' });
  }

  const filename = `${safeFilename(quiz.lessonName)}-unit-${safeFilename(quiz.unitNo)}-mcq.pdf`;
  document.save(filename);
}

export async function downloadQuizAnswersPdf(quiz, result) {
  if (!quiz?.questions?.length || !result?.results?.length) {
    throw new Error('Check the exam before downloading the answers.');
  }

  const { jsPDF } = await import('jspdf');
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (PAGE_MARGIN * 2);
  let y = PAGE_MARGIN;

  const ensureSpace = (height) => {
    if (y + height <= PAGE_BOTTOM) return;
    document.addPage();
    y = PAGE_MARGIN;
  };

  const writeLines = (text, options = {}) => {
    const {
      fontSize = 10,
      fontStyle = 'normal',
      gapAfter = 2,
      color = [23, 32, 51],
    } = options;
    document.setFont('helvetica', fontStyle);
    document.setFontSize(fontSize);
    document.setTextColor(...color);
    const lines = document.splitTextToSize(String(text ?? ''), contentWidth);
    const lineHeight = fontSize * 0.42;
    ensureSpace((lines.length * lineHeight) + gapAfter);
    document.text(lines, PAGE_MARGIN, y);
    y += (lines.length * lineHeight) + gapAfter;
  };

  document.setFillColor(23, 107, 85);
  document.rect(0, 0, pageWidth, 34, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(19);
  document.text('MCQ Answers', PAGE_MARGIN, 16);
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.text(`${quiz.lessonName || 'Lesson'} - Unit ${quiz.unitNo ?? '-'}`, PAGE_MARGIN, 25);
  y = 44;

  result.results.forEach((answer, questionIndex) => {
    ensureSpace(20);
    writeLines(`Question ${questionIndex + 1}`, {
      fontSize: 11,
      fontStyle: 'bold',
      gapAfter: 1,
    });
    writeLines(`Answer: ${answer.correctAnswer}`, {
      fontStyle: 'bold',
      color: [21, 88, 68],
      gapAfter: 1,
    });
    writeLines(`Reason: ${answer.explanation || 'No explanation available.'}`, {
      color: [71, 85, 105],
      gapAfter: 5,
    });
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(100, 116, 139);
    document.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, 290, { align: 'right' });
  }

  const filename = `${safeFilename(quiz.lessonName)}-unit-${safeFilename(quiz.unitNo)}-answers.pdf`;
  document.save(filename);
}
