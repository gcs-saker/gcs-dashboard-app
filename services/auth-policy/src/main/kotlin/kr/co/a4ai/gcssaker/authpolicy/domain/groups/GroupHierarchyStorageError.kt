package kr.co.a4ai.gcssaker.authpolicy.domain

enum class GroupHierarchyErrorCode(val value: String) {
    INCOMPLETE("group_hierarchy_incomplete"), UNAVAILABLE("group_hierarchy_unavailable"),
    CONTENDED("group_hierarchy_contended"), INTERRUPTED("group_hierarchy_interrupted"),
}

class GroupHierarchyStorageError(val errorCode: GroupHierarchyErrorCode, cause: Throwable? = null) :
    RuntimeException("group hierarchy storage is unavailable", cause)
