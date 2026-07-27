APP_STYLE = """
QMainWindow, QWidget {
    background: #0b1115;
    color: #f3f7fa;
    font-family: Segoe UI;
    font-size: 12px;
}

QFrame#Sidebar {
    background: #0f171d;
    border: 1px solid #1b2a33;
    border-radius: 24px;
}

QFrame#TopBar, QFrame#Card, QFrame#Surface {
    background: #121c23;
    border: 1px solid #20303a;
    border-radius: 22px;
}

QFrame#HeroCard, QFrame#MetricCard, QFrame#FilterCard, QFrame#ActionCard {
    background: #121c23;
    border: 1px solid #20303a;
    border-radius: 22px;
}

QFrame#MetricCard {
    min-height: 92px;
}

QLabel#AppTitle {
    font-size: 22px;
    font-weight: 700;
}

QLabel#SectionTitle {
    font-size: 24px;
    font-weight: 700;
}

QLabel#SectionSubtitle {
    color: #9fb0bb;
    font-size: 12px;
}

QLabel#MetricLabel {
    color: #9fb0bb;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

QLabel#MetricValue {
    font-size: 22px;
    font-weight: 800;
}

QLabel#MetricHint {
    color: #8fa0aa;
    font-size: 10px;
}

QPushButton {
    background: #18242c;
    color: #f3f7fa;
    border: 1px solid #2a3b46;
    padding: 10px 14px;
    border-radius: 14px;
}

QPushButton:hover {
    background: #20303a;
}

QPushButton:checked {
    background: #74d3b2;
    color: #081115;
    border: 1px solid #74d3b2;
    font-weight: 700;
}

QPushButton#Primary {
    background: #74d3b2;
    color: #081115;
    border: none;
    font-weight: 700;
}

QPushButton#Primary:hover {
    background: #8ce2c4;
}

QLineEdit, QTextEdit, QTableWidget, QListWidget {
    background: #0f171d;
    color: #f3f7fa;
    border: 1px solid #23323c;
    border-radius: 14px;
    padding: 10px 12px;
}

QComboBox, QDateEdit {
    background: #0f171d;
    color: #f3f7fa;
    border: 1px solid #23323c;
    border-radius: 14px;
    padding: 10px 12px;
    min-height: 18px;
}

QComboBox:focus, QDateEdit:focus {
    border: 1px solid #74d3b2;
}

QComboBox::drop-down {
    border: none;
    width: 20px;
}

QComboBox QAbstractItemView {
    background: #0f171d;
    border: 1px solid #23323c;
    selection-background-color: #24424a;
    outline: 0;
}

QTableWidget {
    gridline-color: #20303a;
    selection-background-color: #24424a;
    selection-color: #ffffff;
}

QHeaderView::section {
    background: #121c23;
    color: #9fb0bb;
    border: none;
    padding: 10px 8px;
    font-weight: 600;
}

QScrollArea {
    border: none;
    background: transparent;
}
"""
