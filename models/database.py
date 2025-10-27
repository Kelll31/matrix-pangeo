"""
Database models for MITRE ATT&CK Matrix API
ИСПРАВЛЕНА ПРОБЛЕМА с metadata - переименовано в audit_metadata
"""

import uuid
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import json

db = SQLAlchemy()


class Tactics(db.Model):
    """MITRE ATT&CK Tactics model"""

    __tablename__ = "tactics"

    id = db.Column(db.String(20), primary_key=True)  # TA0001
    name = db.Column(db.String(255), nullable=False)
    name_ru = db.Column(db.String(255))
    x_mitre_shortname = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    description_ru = db.Column(db.Text)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    technique_tactics = db.relationship("TechniqueTactics", back_populates="tactic")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "name_ru": self.name_ru,
            "x_mitre_shortname": self.x_mitre_shortname,
            "description": self.description,
            "description_ru": self.description_ru,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Techniques(db.Model):
    """MITRE ATT&CK Techniques model"""

    __tablename__ = "techniques"

    id = db.Column(db.String(50), primary_key=True)  # UUID
    attack_id = db.Column(db.String(20), nullable=False, unique=True)  # T1189
    name = db.Column(db.String(500), nullable=False)
    name_ru = db.Column(db.String(500))
    description = db.Column(db.Text)
    description_ru = db.Column(db.Text)
    platforms = db.Column(db.JSON)  # JSON array
    data_sources = db.Column(db.JSON)  # JSON array
    permissions_required = db.Column(db.JSON)  # JSON array
    version = db.Column(db.String(10), default="1.0")
    deprecated = db.Column(db.Boolean, default=False)
    revoked = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    technique_tactics = db.relationship("TechniqueTactics", back_populates="technique")
    correlation_rules = db.relationship("CorrelationRules", back_populates="technique")
    comments = db.relationship(
        "Comments",
        foreign_keys="Comments.entity_id",
        primaryjoin='and_(Techniques.attack_id==Comments.entity_id, Comments.entity_type=="technique")',
    )

    def to_dict(self):
        return {
            "id": self.id,
            "attack_id": self.attack_id,
            "name": self.name,
            "name_ru": self.name_ru,
            "description": self.description,
            "description_ru": self.description_ru,
            "platforms": self.platforms,
            "data_sources": self.data_sources,
            "permissions_required": self.permissions_required,
            "version": self.version,
            "deprecated": self.deprecated,
            "revoked": self.revoked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TechniqueTactics(db.Model):
    """Many-to-Many relationship between Techniques and Tactics"""

    __tablename__ = "technique_tactics"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    technique_id = db.Column(
        db.String(50), db.ForeignKey("techniques.id"), nullable=False
    )
    tactic_id = db.Column(db.String(20), db.ForeignKey("tactics.id"), nullable=False)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)

    # Relationships
    technique = db.relationship("Techniques", back_populates="technique_tactics")
    tactic = db.relationship("Tactics", back_populates="technique_tactics")

    __table_args__ = (
        db.UniqueConstraint(
            "technique_id", "tactic_id", name="unique_technique_tactic"
        ),
    )


class CorrelationRules(db.Model):
    """Модель правил корреляции с управлением статусом рабочего процесса"""

    __tablename__ = "correlation_rules"

    # =========================================================================
    # PRIMARY KEY & BASIC FIELDS
    # =========================================================================

    id = db.Column(
        db.String(100),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        comment="Уникальный ID правила",
    )
    name = db.Column(
        db.String(500), nullable=False, index=True, comment="Название правила"
    )
    name_ru = db.Column(db.String(500), nullable=True, comment="Название на русском")
    description = db.Column(db.Text, nullable=True, comment="Описание правила")
    description_ru = db.Column(db.Text, nullable=True, comment="Описание на русском")

    # =========================================================================
    # TECHNIQUE REFERENCE
    # =========================================================================

    technique_id = db.Column(
        db.String(20),
        db.ForeignKey("techniques.attack_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="MITRE ATT&CK ID техники",
    )

    # =========================================================================
    # LOGIC & TYPE
    # =========================================================================

    logic = db.Column(
        db.Text, nullable=True, comment="Логика правила (Sigma, KQL, etc)"
    )
    logic_type = db.Column(
        db.Enum("sigma", "kql", "spl", "sql", "other"),
        default="other",
        nullable=False,
        comment="Тип логики",
    )

    # =========================================================================
    # RULE METADATA
    # =========================================================================

    severity = db.Column(
        db.Enum("low", "medium", "high", "critical"),
        default="medium",
        nullable=False,
        index=True,
        comment="Критичность",
    )
    confidence = db.Column(
        db.Enum("low", "medium", "high"),
        default="medium",
        nullable=False,
        comment="Уверенность",
    )
    active = db.Column(
        db.Boolean, default=True, index=True, comment="Активно ли правило"
    )
    status = db.Column(
        db.Enum("draft", "testing", "active", "deprecated", "disabled"),
        default="draft",
        nullable=False,
        index=True,
        comment="Статус правила",
    )

    # =========================================================================
    # ORGANIZATION & TAGGING
    # =========================================================================

    folder = db.Column(
        db.String(200),
        default="default",
        nullable=False,
        index=True,
        comment="Папка/категория",
    )
    author = db.Column(
        db.String(200), nullable=True, index=True, comment="Автор правила"
    )
    references = db.Column(db.JSON, nullable=True, comment="Ссылки и источники")
    false_positives = db.Column(
        db.Text, nullable=True, comment="Возможные ложные срабатывания"
    )
    tags = db.Column(db.JSON, nullable=True, comment="Теги для поиска")

    # =========================================================================
    # AUDIT FIELDS
    # =========================================================================

    created_at = db.Column(
        db.TIMESTAMP,
        default=datetime.utcnow,
        nullable=False,
        index=True,
        comment="Дата создания",
    )
    updated_at = db.Column(
        db.TIMESTAMP,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        index=True,
        comment="Дата обновления",
    )

    # =========================================================================
    # WORKFLOW STATUS FIELDS
    # =========================================================================

    workflow_status = db.Column(
        db.String(50),
        default="not_started",
        nullable=False,
        index=True,
        comment="Workflow status: not_started, info_required, in_progress, stopped, tested, deployed, archived",
    )

    # Исполнитель для статуса "В работе"
    assignee_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="User ID of the person assigned to work on this rule",
    )

    # Причина остановки
    stopped_reason = db.Column(
        db.Text, nullable=True, comment="Reason why rule was stopped"
    )

    # URL MR в Git для статуса "Выгружено"
    deployment_mr_url = db.Column(
        db.String(500), nullable=True, comment="URL to the merge request for deployment"
    )

    # Тестировал
    tested_by_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="User ID of the person who tested this rule",
    )

    # Последнее изменение workflow статуса
    workflow_updated_at = db.Column(
        db.TIMESTAMP,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=True,
        comment="When workflow status was last updated",
    )

    # =========================================================================
    # RELATIONSHIPS
    # =========================================================================

    # Связь с техниками
    technique = db.relationship(
        "Techniques",
        foreign_keys=[technique_id],
        lazy="joined",
    )

    # Исполнитель
    assignee = db.relationship(
        "Users", foreign_keys=[assignee_id], backref="assigned_rules", lazy="joined"
    )

    # Тестировщик
    tested_by = db.relationship(
        "Users", foreign_keys=[tested_by_id], backref="tested_rules", lazy="joined"
    )

    # Комментарии
    comments = db.relationship(
        "Comments",
        backref="rule",
        lazy="dynamic",
        cascade="all, delete-orphan",
        foreign_keys="Comments.entity_id",
        primaryjoin="and_(CorrelationRules.id==foreign(Comments.entity_id), Comments.entity_type=='rule')",
    )

    # =========================================================================
    # CONSTRAINTS & INDEXES
    # =========================================================================

    __table_args__ = (
        db.Index("idx_technique", "technique_id"),
        db.Index("idx_status", "status"),
        db.Index("idx_active", "active"),
        db.Index("idx_severity", "severity"),
        db.Index("idx_folder", "folder"),
        db.Index("idx_author", "author"),
        db.Index("idx_updated", "updated_at"),
        db.Index("idx_rule_technique_status", "technique_id", "status"),
        db.UniqueConstraint("name", name="uq_correlation_rules_name"),
    )

    # =========================================================================
    # METHODS
    # =========================================================================

    def to_dict(self, include_comments=False):
        """Конвертирует модель в словарь"""
        data = {
            # Basic fields
            "id": self.id,
            "name": self.name,
            "name_ru": self.name_ru,
            "description": self.description,
            "description_ru": self.description_ru,
            # Technique
            "technique_id": self.technique_id,
            "technique_name": self.technique.name if self.technique else None,
            "technique_name_ru": self.technique.name_ru if self.technique else None,
            # Logic
            "logic": self.logic,
            "logic_type": self.logic_type,
            # Metadata
            "severity": self.severity,
            "confidence": self.confidence,
            "active": self.active,
            "status": self.status,
            "folder": self.folder,
            "author": self.author,
            "references": self.references,
            "false_positives": self.false_positives,
            "tags": self.tags,
            # Audit
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Workflow status
            "workflow_status": self.workflow_status,
            "workflow_updated_at": (
                self.workflow_updated_at.isoformat()
                if self.workflow_updated_at
                else None
            ),
            "assignee_id": self.assignee_id,
            "assignee": (
                {
                    "id": self.assignee.id,
                    "username": self.assignee.username,
                    "email": self.assignee.email,
                }
                if self.assignee
                else None
            ),
            "stopped_reason": self.stopped_reason,
            "deployment_mr_url": self.deployment_mr_url,
            "tested_by_id": self.tested_by_id,
            "tested_by": (
                {
                    "id": self.tested_by.id,
                    "username": self.tested_by.username,
                    "email": self.tested_by.email,
                }
                if self.tested_by
                else None
            ),
        }

        # Добавляем комментарии если требуется
        if include_comments:
            try:
                data["comments"] = [
                    {
                        "id": c.id,
                        "author_name": c.author_name,
                        "text": c.text,
                        "comment_type": c.comment_type,
                        "created_at": (
                            c.created_at.isoformat() if c.created_at else None
                        ),
                        "updated_at": (
                            c.updated_at.isoformat() if c.updated_at else None
                        ),
                    }
                    for c in self.comments.all()
                ]
                data["comments_count"] = len(data["comments"])
            except Exception:
                data["comments"] = []
                data["comments_count"] = 0

        return data

    def to_minimal_dict(self):
        """Минимальный словарь для быстрого отображения"""
        return {
            "id": self.id,
            "name": self.name,
            "name_ru": self.name_ru,
            "severity": self.severity,
            "status": self.status,
            "workflow_status": self.workflow_status,
            "active": self.active,
            "author": self.author,
            "technique_id": self.technique_id,
            "assignee_id": self.assignee_id,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @staticmethod
    def get_by_id(rule_id):
        """Получить правило по ID"""
        return (
            db.session.query(CorrelationRules)
            .filter(CorrelationRules.id == rule_id)
            .first()
        )

    @staticmethod
    def get_by_name(name, name_ru=None):
        """Получить правило по названию"""
        query = db.session.query(CorrelationRules)
        if name:
            query = query.filter(CorrelationRules.name == name)
        if name_ru:
            query = query.filter(CorrelationRules.name_ru == name_ru)
        return query.first()

    @staticmethod
    def get_by_technique(technique_id, active_only=True):
        """Получить все правила для техники"""
        query = db.session.query(CorrelationRules).filter(
            CorrelationRules.technique_id == technique_id
        )
        if active_only:
            query = query.filter(CorrelationRules.active == True)
        return query.all()

    def get_comments_count(self):
        """Получить количество комментариев"""
        try:
            return self.comments.count()
        except Exception:
            return 0

    def get_available_next_statuses(self):
        """Получить доступные следующие статусы"""
        WORKFLOW_TRANSITIONS = {
            "not_started": ["info_required", "in_progress"],
            "info_required": ["in_progress", "not_started"],
            "in_progress": ["stopped", "ready_for_testing"],
            "stopped": ["in_progress", "not_started"],
            "ready_for_testing": ["tested", "returned", "in_progress"],
            "tested": ["deployed", "returned"],
            "deployed": [],
        }
        return WORKFLOW_TRANSITIONS.get(self.workflow_status, [])

    def can_transition_to(self, new_status):
        """Проверить, возможен ли переход в новый статус"""
        available = self.get_available_next_statuses()
        return new_status in available

    def __repr__(self):
        return (
            f"<CorrelationRule("
            f"id={self.id}, "
            f"name={self.name}, "
            f"status={self.status}, "
            f"workflow={self.workflow_status}"
            f")>"
        )


class Users(db.Model):
    """Users model"""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(100), nullable=False, unique=True)
    email = db.Column(db.String(255))
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(255))
    role = db.Column(db.Enum("analyst", "admin", "viewer"), default="analyst")
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.TIMESTAMP)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def set_password(self, password):
        """Set password hash - ИСПРАВЛЕНО: явно указываем метод"""
        self.password_hash = generate_password_hash(
            password, method="pbkdf2:sha256:600000"
        )

    def check_password(self, password):
        """Check password - ИСПРАВЛЕНО: добавлена обработка ошибок"""
        if not self.password_hash:
            print("❌ No password hash!")
            return False

        try:
            result = check_password_hash(self.password_hash, password)
            print(f"✓ Password check result: {result}")
            return result
        except Exception as e:
            print(f"❌ Password check error: {e}")
            return False

    def to_dict(self, include_sensitive=False):
        data = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_sensitive:
            data["password_hash"] = self.password_hash

        return data


class UserSessions(db.Model):
    """User sessions model for authentication tokens"""

    __tablename__ = "user_sessions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    session_token = db.Column(db.String(255), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.TIMESTAMP, nullable=False)
    ip_address = db.Column(db.String(45))  # IPv4 или IPv6
    user_agent = db.Column(db.Text)
    last_activity = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)

    # Relationship to User
    user = db.relationship("Users", backref="sessions")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_token": self.session_token,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "last_activity": (
                self.last_activity.isoformat() if self.last_activity else None
            ),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<UserSessions(id={self.id}, user_id={self.user_id}, is_active={self.is_active})>"


class Comments(db.Model):
    """Comments model for techniques and rules"""

    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    entity_type = db.Column(
        db.Enum("technique", "rule", "user", "system"), nullable=False
    )
    entity_id = db.Column(db.String(100), nullable=False)  # technique_id or rule_id
    parent_comment_id = db.Column(db.Integer, db.ForeignKey("comments.id"))
    text = db.Column(db.Text, nullable=False)
    comment_type = db.Column(
        db.Enum("comment", "note", "question", "issue", "improvement", "critical"),
        default="comment",
    )
    priority = db.Column(
        db.Enum("low", "normal", "high", "critical", "urgent"), default="normal"
    )
    visibility = db.Column(
        db.Enum("public", "internal", "private", "team"), default="public"
    )
    status = db.Column(
        db.Enum("active", "resolved", "locked", "deleted", "pending"), default="active"
    )
    author_name = db.Column(db.String(200), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)
    updated_at = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Self-referential relationship for threading
    replies = db.relationship("Comments", remote_side=[id], backref="parent")

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "parent_comment_id": self.parent_comment_id,
            "text": self.text,
            "comment_type": self.comment_type,
            "priority": self.priority,
            "visibility": self.visibility,
            "status": self.status,
            "author_name": self.author_name,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AuditLog(db.Model):
    """Audit log for security events"""

    __tablename__ = "audit_log"

    id = db.Column(db.String(64), primary_key=True)
    event_type = db.Column(db.String(100), nullable=False)
    level = db.Column(
        db.Enum("DEBUG", "INFO", "WARN", "ERROR", "CRITICAL", "SECURITY"),
        default="INFO",
    )
    description = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    user_ip = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    entity_type = db.Column(db.String(100))
    entity_id = db.Column(db.String(100))
    old_values = db.Column(db.JSON)
    new_values = db.Column(db.JSON)
    # ИСПРАВЛЕНО: заменил 'metadata' на 'audit_metadata' чтобы избежать конфликта с SQLAlchemy
    audit_metadata = db.Column(db.JSON)
    session_id = db.Column(db.String(128))
    request_id = db.Column(db.String(128))
    risk_score = db.Column(db.DECIMAL(5, 2), default=0.00)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "event_type": self.event_type,
            "level": self.level,
            "description": self.description,
            "user_id": self.user_id,
            "user_ip": self.user_ip,
            "user_agent": self.user_agent,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "old_values": self.old_values,
            "new_values": self.new_values,
            "metadata": self.audit_metadata,  # В API возвращаем как 'metadata' для совместимости
            "session_id": self.session_id,
            "request_id": self.request_id,
            "risk_score": float(self.risk_score) if self.risk_score else 0.0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SystemLogs(db.Model):
    """System logs model"""

    __tablename__ = "system_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    level = db.Column(db.String(20), nullable=False)
    source = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.TIMESTAMP, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    ip = db.Column(db.String(45))

    def to_dict(self):
        return {
            "id": self.id,
            "level": self.level,
            "source": self.source,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "user_id": self.user_id,
            "ip": self.ip,
        }


class MatrixStatistics(db.Model):
    """Matrix statistics cache model"""

    __tablename__ = "matrix_statistics"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    metric_name = db.Column(db.String(100), nullable=False, unique=True)
    metric_value = db.Column(db.BigInteger, nullable=False)
    metric_data = db.Column(db.JSON)
    calculated_at = db.Column(
        db.TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "metric_name": self.metric_name,
            "metric_value": self.metric_value,
            "metric_data": self.metric_data,
            "calculated_at": (
                self.calculated_at.isoformat() if self.calculated_at else None
            ),
        }
