# 🎓 College Transfer AI

**College Transfer AI** is an intelligent planning tool that helps California Community College students generate a personalized PDF report showing transferable courses to selected University of California (UC) campuses for a chosen major and transfer year. If a required course is not offered at the primary community college, the system searches other CCCs for articulated equivalents. It even includes an AI counselor that provides tailored academic advice based on the report.

---

## 🚀 Features

- ✅ Input your:
  - Target UC campuses (e.g., UC Berkeley, UC San Diego)
  - Major (e.g., Computer Science)
  - Transfer year (e.g., Fall 2026)
  - Primary CCC (e.g., Diablo Valley College)

- 📄 Outputs a PDF for each selected UC campus:
  - Lists all transferable courses needed for the selected major.
  - Maps CCC equivalents with course name, unit count, and originating college.
  - Indicates if a course is not offered at your CCC and shows an alternative from another CCC (if available).
  - Clearly notes any courses that must be taken at the UC post-transfer.

- 💬 Includes an AI guidance counselor:
  - Reads the PDF and user input.
  - Recommends a personalized education plan.
  - Provides helpful advice and strategies for successful transfer.

---

## 📥 Getting Started

```bash
# Clone the repository
git clone https://github.com/your-username/college-transfer-ai.git
cd college-transfer-ai

# (Optional) Create a virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run the script
python -m college_transfer_ai.app
```
## 📌 Example

For a student transferring **Computer Science** from **Los Medanos College** and **Diablo Valley College** to **UC Berkeley**, the system generates a PDF showing:

- Required UC courses (e.g., CS 61A, Math 1B)
- Equivalent CCC courses (e.g., COMSC 132 at LMC)
- Notes if a course must be taken after transfer or is unavailable at any CCC
- Multiple CCCs where required courses may be completed

Each PDF starts with the name of the UC campus, followed by the list of CCCs where articulated classes can be taken. If no CCC offers a transferable course, the PDF clearly states that.

---

## 🤖 Coming Soon

- Web interface for input/output
- Full integration with AI academic advisor
- Export education plan to calendar/schedule

---

## 📄 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Contributions are welcome! Open an issue to discuss your idea or submit a pull request.

---

## 📬 Contact

Made by [Ahmon Embaye]

For questions or support, reach out at [ahmonembaye@example.com] or via GitHub Issues.

