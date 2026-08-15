@echo off
chcp 936 >nul
setlocal EnableDelayedExpansion

set GIT_PAGER=
set PAGER=
git config --global core.pager ""
git config --global core.autocrlf true

title GitHub 自动管理工具

:MAIN
cls
echo.
echo ========================================
echo     GitHub 自动管理工具
echo ========================================
echo     1. 初始化并首次上传
echo     2. 提交并推送更新
echo     3. 拉取远程更新
echo     4. 查看仓库状态
echo     5. 分支管理
echo     6. 查看提交日志
echo     7. 配置 Git 用户信息
echo     8. 生成 .gitignore
echo     9. 撤销操作
echo     0. 退出
echo ========================================
echo.

git --version >nul 2>nul
if errorlevel 1 (
    echo [错误] Git 未安装
    pause
    exit /b 1
)

for /f "delims=" %%v in ('git --version') do echo [信息] %%v
echo [信息] 目录: %CD%

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [信息] 当前不是 Git 仓库
    set "IN_REPO=0"
) else (
    set "IN_REPO=1"
    for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%b"
    if not defined CURRENT_BRANCH set "CURRENT_BRANCH=unknown"
    echo [信息] 分支: !CURRENT_BRANCH!

    set "REMOTE_URL="
    for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set "REMOTE_URL=%%r"
    if defined REMOTE_URL (
        echo [信息] 远程: !REMOTE_URL!
    ) else (
        echo [信息] 远程: 未配置
    )

    set "CHANGED=0"
    for /f %%c in ('git status --short 2^>nul ^| find /c /v ""') do set "CHANGED=%%c"
    echo [信息] 变更: !CHANGED! 个文件
)

set "GIT_USER="
set "GIT_EMAIL="
for /f "delims=" %%n in ('git config --global user.name 2^>nul') do set "GIT_USER=%%n"
for /f "delims=" %%e in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%e"

if not defined GIT_USER (
    echo [警告] 未配置用户名，请先选择 7
)
if not defined GIT_EMAIL (
    echo [警告] 未配置邮箱，请先选择 7
)
if defined GIT_USER if defined GIT_EMAIL (
    echo [信息] 用户: !GIT_USER!
)

echo.
set /p "choice=请选择 [0-9]: "

if "%choice%"=="1" goto FIRST_UPLOAD
if "%choice%"=="2" goto PUSH_UPDATE
if "%choice%"=="3" goto PULL_REMOTE
if "%choice%"=="4" goto VIEW_STATUS
if "%choice%"=="5" goto BRANCH_MANAGE
if "%choice%"=="6" goto VIEW_LOG
if "%choice%"=="7" goto CONFIG_USER
if "%choice%"=="8" goto GEN_GITIGNORE
if "%choice%"=="9" goto UNDO_MENU
if "%choice%"=="0" exit /b 0

echo 无效选择
timeout /t 2 >nul
goto MAIN


:FIRST_UPLOAD
cls
echo.
echo ========== 首次上传 ==========
echo.

if not defined GIT_USER (
    echo [错误] 请先配置用户名
    pause
    goto MAIN
)
if not defined GIT_EMAIL (
    echo [错误] 请先配置邮箱
    pause
    goto MAIN
)

if "%IN_REPO%"=="1" (
    echo [警告] 已是 Git 仓库
    set /p "confirm_reinit=重新配置远程? (y/n): "
    if /i "!confirm_reinit!" neq "y" goto MAIN
    goto SET_REMOTE
)

set /p "repo=GitHub 仓库地址: "
if not defined repo (
    echo [错误] 地址不能为空
    pause
    goto MAIN
)

echo.
echo [1/6] 初始化...
git init
if errorlevel 1 goto ERR

if not exist ".gitignore" (
    set /p "need_ignore=生成 .gitignore? (y/n): "
    if /i "!need_ignore!"=="y" call :CREATE_GITIGNORE general
)

echo.
echo [2/6] 添加文件...
git add . 2>nul
if errorlevel 1 goto ERR

echo.
echo 文件列表:
echo ----------------------------------------
git --no-pager diff --cached --name-only
echo ----------------------------------------

git diff --cached --quiet 2>nul
if not errorlevel 1 (
    echo [警告] 没有可提交的文件
    pause
    goto MAIN
)

echo.
set /p "commit_msg=提交说明 (回车用默认): "
if not defined commit_msg set "commit_msg=Initial Commit"

echo.
echo [3/6] 提交...
git commit -m "!commit_msg!" 2>nul
if errorlevel 1 goto ERR

echo.
echo [4/6] 设置 main 分支...
git branch -M main
if errorlevel 1 goto ERR

:SET_REMOTE
if not defined repo (
    set /p "repo=GitHub 仓库地址: "
    if not defined repo (
        echo [错误] 地址不能为空
        pause
        goto MAIN
    )
)

echo.
echo [5/6] 配置远程...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin "!repo!"
) else (
    git remote set-url origin "!repo!"
)
if errorlevel 1 goto ERR

echo.
echo [6/6] 推送...

git push -u origin main 2>nul
if errorlevel 1 (
    echo.
    echo [警告] 推送失败，远程可能非空
    echo   1. 强制推送
    echo   2. 先拉取再推送
    echo   3. 取消
    set /p "push_choice=选择 [1-3]: "

    if "!push_choice!"=="1" (
        set /p "force_confirm=确认强推? (yes/no): "
        if /i "!force_confirm!"=="yes" (
            git push -u origin main --force
            if errorlevel 1 goto ERR
        ) else (
            goto MAIN
        )
    ) else if "!push_choice!"=="2" (
        git pull origin main --rebase --allow-unrelated-histories
        if errorlevel 1 goto ERR
        git push -u origin main
        if errorlevel 1 goto ERR
    ) else (
        goto MAIN
    )
)

echo.
echo [OK] 首次上传完成
echo 地址: !repo!
echo 分支: main
echo.
pause
goto MAIN


:PUSH_UPDATE
cls
echo.
echo ========== 提交推送 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库，请先初始化
    pause
    goto MAIN
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo [错误] 未配置远程地址
    pause
    goto MAIN
)

echo 状态:
echo ----------------------------------------
git --no-pager status --short
echo ----------------------------------------

set "HAS_CHANGES=0"
for /f %%x in ('git status --porcelain 2^>nul ^| find /c /v ""') do (
    if %%x gtr 0 set "HAS_CHANGES=1"
)

if "!HAS_CHANGES!"=="0" (
    echo.
    echo [信息] 没有变更
    set /p "force_push=推送已有提交? (y/n): "
    if /i "!force_push!"=="y" (
        git push
        if errorlevel 1 goto ERR
        echo [OK] 完成
    )
    pause
    goto MAIN
)

echo.
git --no-pager diff --stat
echo.

set /p "msg=提交说明 (回车用默认): "
if not defined msg set "msg=update %date% %time:~0,8%"

echo.
echo [1/3] 暂存...
git add . 2>nul
if errorlevel 1 goto ERR

echo [2/3] 提交...
git commit -m "!msg!" 2>nul
if errorlevel 1 goto ERR

echo [3/3] 推送...
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "PUSH_BRANCH=%%b"
if not defined PUSH_BRANCH set "PUSH_BRANCH=main"

git push -u origin "!PUSH_BRANCH!"
if errorlevel 1 (
    echo.
    echo [警告] 推送失败
    set /p "try_pull=先拉取再推? (y/n): "
    if /i "!try_pull!"=="y" (
        git pull --rebase origin "!PUSH_BRANCH!"
        if errorlevel 1 goto ERR
        git push -u origin "!PUSH_BRANCH!"
        if errorlevel 1 goto ERR
    ) else (
        goto ERR
    )
)

echo.
echo [OK] 推送完成
echo 分支: !PUSH_BRANCH!
echo 说明: !msg!
echo.
pause
goto MAIN


:PULL_REMOTE
cls
echo.
echo ========== 拉取更新 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库
    pause
    goto MAIN
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo [错误] 未配置远程
    pause
    goto MAIN
)

for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "PULL_BRANCH=%%b"
if not defined PULL_BRANCH set "PULL_BRANCH=main"

echo 分支: !PULL_BRANCH!
echo.
echo   1. merge
echo   2. rebase
echo   3. fetch
echo.
set /p "pull_type=选择 [1-3]: "

if "!pull_type!"=="1" (
    git pull origin "!PULL_BRANCH!"
) else if "!pull_type!"=="2" (
    git pull --rebase origin "!PULL_BRANCH!"
) else if "!pull_type!"=="3" (
    git fetch origin
    echo.
    git --no-pager log "!PULL_BRANCH!..origin/!PULL_BRANCH!" --oneline 2>nul
) else (
    echo 无效选择
    pause
    goto MAIN
)

if errorlevel 1 (
    echo [错误] 拉取失败
    git diff --name-only --diff-filter=U 2>nul
) else (
    echo [OK] 完成
)

echo.
pause
goto MAIN


:VIEW_STATUS
cls
echo.
echo ========== 仓库状态 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库
    pause
    goto MAIN
)

echo -- 状态 --
git --no-pager status
echo.
echo -- 远程 --
git --no-pager remote -v
echo.
echo -- 分支 --
git --no-pager branch -a
echo.
echo -- 最近5次提交 --
git --no-pager log --oneline -5 2>nul
echo.
echo -- 未推送 --
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "STATUS_BRANCH=%%b"
git --no-pager log "origin/!STATUS_BRANCH!..!STATUS_BRANCH!" --oneline 2>nul

echo.
pause
goto MAIN


:BRANCH_MANAGE
cls
echo.
echo ========== 分支管理 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库
    pause
    goto MAIN
)

echo 分支列表:
echo ----------------------------------------
git --no-pager branch -a
echo ----------------------------------------
echo.

for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "NOW_BRANCH=%%b"
echo 当前: !NOW_BRANCH!
echo.
echo   1. 创建分支
echo   2. 切换分支
echo   3. 合并分支
echo   4. 删除分支
echo   5. 推送分支
echo   6. 返回
echo.
set /p "br_choice=选择 [1-6]: "

if "!br_choice!"=="1" (
    set /p "new_branch=分支名: "
    if not defined new_branch (
        echo [错误] 不能为空
        pause
        goto BRANCH_MANAGE
    )
    git checkout -b "!new_branch!"
    if errorlevel 1 goto ERR
    echo [OK] 已创建: !new_branch!

) else if "!br_choice!"=="2" (
    set /p "switch_branch=分支名: "
    if not defined switch_branch (
        echo [错误] 不能为空
        pause
        goto BRANCH_MANAGE
    )
    git checkout "!switch_branch!"
    if errorlevel 1 goto ERR
    echo [OK] 已切换: !switch_branch!

) else if "!br_choice!"=="3" (
    set /p "merge_branch=合并哪个分支: "
    if not defined merge_branch (
        echo [错误] 不能为空
        pause
        goto BRANCH_MANAGE
    )
    git merge "!merge_branch!"
    if errorlevel 1 (
        echo [错误] 有冲突
        git diff --name-only --diff-filter=U 2>nul
    ) else (
        echo [OK] 合并完成
    )

) else if "!br_choice!"=="4" (
    set /p "del_branch=删除哪个分支: "
    if not defined del_branch (
        echo [错误] 不能为空
        pause
        goto BRANCH_MANAGE
    )
    if "!del_branch!"=="!NOW_BRANCH!" (
        echo [错误] 不能删除当前分支
        pause
        goto BRANCH_MANAGE
    )
    set /p "del_confirm=确认? (y/n): "
    if /i "!del_confirm!"=="y" (
        git branch -d "!del_branch!"
        if errorlevel 1 (
            set /p "force_del=强制删除? (y/n): "
            if /i "!force_del!"=="y" (
                git branch -D "!del_branch!"
                if errorlevel 1 goto ERR
            )
        )
        echo [OK] 已删除
    )

) else if "!br_choice!"=="5" (
    set /p "push_br=分支名 (回车=当前): "
    if not defined push_br set "push_br=!NOW_BRANCH!"
    git push -u origin "!push_br!"
    if errorlevel 1 goto ERR
    echo [OK] 已推送: !push_br!

) else if "!br_choice!"=="6" (
    goto MAIN
)

echo.
pause
goto BRANCH_MANAGE


:VIEW_LOG
cls
echo.
echo ========== 提交日志 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库
    pause
    goto MAIN
)

echo   1. 简洁 (20条)
echo   2. 详细 (10条)
echo   3. 分支图 (30条)
echo   4. 按作者
echo   5. 按关键词
echo   6. 返回
echo.
set /p "log_choice=选择 [1-6]: "

if "!log_choice!"=="1" (
    echo.
    git --no-pager log --oneline -20
) else if "!log_choice!"=="2" (
    echo.
    git --no-pager log -10
) else if "!log_choice!"=="3" (
    echo.
    git --no-pager log --oneline --graph --all -30
) else if "!log_choice!"=="4" (
    set /p "log_author=作者: "
    git --no-pager log --oneline --author="!log_author!" -20
) else if "!log_choice!"=="5" (
    set /p "log_keyword=关键词: "
    git --no-pager log --oneline --grep="!log_keyword!" -20
) else if "!log_choice!"=="6" (
    goto MAIN
)

echo.
pause
goto VIEW_LOG


:CONFIG_USER
cls
echo.
echo ========== 用户配置 ==========
echo.

echo 当前配置:
echo ----------------------------------------
for /f "delims=" %%n in ('git config --global user.name 2^>nul') do echo 用户名: %%n
for /f "delims=" %%e in ('git config --global user.email 2^>nul') do echo 邮箱: %%e
echo ----------------------------------------
echo.
echo   1. 设置全局用户
echo   2. 设置仓库用户
echo   3. 查看全部配置
echo   4. 设置代理
echo   5. 清除代理
echo   6. 返回
echo.
set /p "config_choice=选择 [1-6]: "

if "!config_choice!"=="1" (
    set /p "cfg_name=用户名: "
    set /p "cfg_email=邮箱: "
    if defined cfg_name git config --global user.name "!cfg_name!"
    if defined cfg_email git config --global user.email "!cfg_email!"
    echo [OK] 已配置

) else if "!config_choice!"=="2" (
    if "%IN_REPO%"=="0" (
        echo [错误] 不是仓库
        pause
        goto CONFIG_USER
    )
    set /p "cfg_name=用户名: "
    set /p "cfg_email=邮箱: "
    if defined cfg_name git config user.name "!cfg_name!"
    if defined cfg_email git config user.email "!cfg_email!"
    echo [OK] 已配置

) else if "!config_choice!"=="3" (
    echo.
    git --no-pager config --global --list 2>nul

) else if "!config_choice!"=="4" (
    set /p "proxy_addr=代理地址: "
    if defined proxy_addr (
        git config --global http.proxy "!proxy_addr!"
        git config --global https.proxy "!proxy_addr!"
        echo [OK] 代理: !proxy_addr!
    )

) else if "!config_choice!"=="5" (
    git config --global --unset http.proxy 2>nul
    git config --global --unset https.proxy 2>nul
    echo [OK] 已清除

) else if "!config_choice!"=="6" (
    goto MAIN
)

echo.
pause
goto CONFIG_USER


:GEN_GITIGNORE
cls
echo.
echo ========== gitignore ==========
echo.

if exist ".gitignore" (
    echo [警告] 已存在 .gitignore
    echo ----------------------------------------
    type .gitignore
    echo.
    echo ----------------------------------------
    set /p "overwrite_ignore=覆盖? (y/n): "
    if /i "!overwrite_ignore!" neq "y" goto MAIN
)

echo   1. 通用
echo   2. Node.js
echo   3. Python
echo   4. Java
echo   5. C/C++
echo   6. Unity
echo   7. 自定义
echo.
set /p "ignore_type=选择 [1-7]: "

if "!ignore_type!"=="1" call :CREATE_GITIGNORE general
if "!ignore_type!"=="2" call :CREATE_GITIGNORE node
if "!ignore_type!"=="3" call :CREATE_GITIGNORE python
if "!ignore_type!"=="4" call :CREATE_GITIGNORE java
if "!ignore_type!"=="5" call :CREATE_GITIGNORE cpp
if "!ignore_type!"=="6" call :CREATE_GITIGNORE unity
if "!ignore_type!"=="7" (
    if exist ".gitignore" del .gitignore
    echo 每行一条规则, 输入 done 结束:
    :CUSTOM_IGNORE_LOOP
    set "ignore_line="
    set /p "ignore_line=  > "
    if /i "!ignore_line!"=="done" (
        echo [OK] 已生成
        goto SHOW_IGNORE
    )
    if "!ignore_line!"=="" goto CUSTOM_IGNORE_LOOP
    echo !ignore_line!>> .gitignore
    goto CUSTOM_IGNORE_LOOP
)

:SHOW_IGNORE
echo.
echo 内容:
echo ----------------------------------------
type .gitignore 2>nul
echo.
echo ----------------------------------------
pause
goto MAIN


:UNDO_MENU
cls
echo.
echo ========== 撤销操作 ==========
echo.

if "%IN_REPO%"=="0" (
    echo [错误] 不是 Git 仓库
    pause
    goto MAIN
)

echo [警告] 撤销可能丢失数据
echo.
echo   1. 撤销工作区修改 (未add)
echo   2. 撤销暂存 (已add未commit)
echo   3. 撤销上次提交 (保留修改)
echo   4. 撤销上次提交 (丢弃修改)
echo   5. 回退到指定提交
echo   6. 返回
echo.
set /p "undo_choice=选择 [1-6]: "

if "!undo_choice!"=="1" (
    echo.
    git --no-pager diff --name-only
    echo.
    set /p "undo_confirm=确认撤销? (yes/no): "
    if /i "!undo_confirm!"=="yes" (
        git checkout -- .
        echo [OK] 已撤销
    )

) else if "!undo_choice!"=="2" (
    git reset HEAD . 2>nul
    echo [OK] 暂存已清空

) else if "!undo_choice!"=="3" (
    echo.
    git --no-pager log --oneline -1
    set /p "undo_confirm=确认? (y/n): "
    if /i "!undo_confirm!"=="y" (
        git reset --soft HEAD~1
        echo [OK] 已撤销, 修改保留
    )

) else if "!undo_choice!"=="4" (
    echo.
    git --no-pager log --oneline -1
    echo [危险] 修改将丢失
    set /p "undo_confirm=输入 yes 确认: "
    if /i "!undo_confirm!"=="yes" (
        git reset --hard HEAD~1
        echo [OK] 已撤销, 修改丢弃
    )

) else if "!undo_choice!"=="5" (
    echo.
    git --no-pager log --oneline -10
    echo.
    set /p "target_hash=提交哈希: "
    if defined target_hash (
        echo   1. 保留修改 (soft)
        echo   2. 丢弃修改 (hard)
        set /p "reset_type=选择 [1-2]: "
        if "!reset_type!"=="1" (
            git reset --soft "!target_hash!"
            echo [OK] 已回退
        ) else if "!reset_type!"=="2" (
            set /p "hard_confirm=确认? (yes/no): "
            if /i "!hard_confirm!"=="yes" (
                git reset --hard "!target_hash!"
                echo [OK] 已回退
            )
        )
    )

) else if "!undo_choice!"=="6" (
    goto MAIN
)

echo.
pause
goto UNDO_MENU


:CREATE_GITIGNORE

set "type=%~1"
if not defined type set "type=general"

(
echo # System
echo .DS_Store
echo Thumbs.db
echo Desktop.ini
echo *.swp
echo *.swo
echo *~
echo.
echo # IDE
echo .idea/
echo .vscode/
echo *.sublime-project
echo *.sublime-workspace
echo.
echo # Env
echo .env
echo .env.local
echo .env.*.local
) > .gitignore

if /i "%type%"=="node" (
    (
    echo.
    echo # Node.js
    echo node_modules/
    echo npm-debug.log*
    echo yarn-debug.log*
    echo yarn-error.log*
    echo package-lock.json
    echo yarn.lock
    echo dist/
    echo build/
    echo .cache/
    echo coverage/
    ) >> .gitignore
)

if /i "%type%"=="python" (
    (
    echo.
    echo # Python
    echo __pycache__/
    echo *.py[cod]
    echo *.so
    echo .Python
    echo venv*/
    echo env/
    echo .venv/
    echo *.egg-info/
    echo dist/
    echo build/
    echo .mypy_cache/
    echo .pytest_cache/
    ) >> .gitignore
)

if /i "%type%"=="java" (
    (
    echo.
    echo # Java
    echo *.class
    echo *.jar
    echo *.war
    echo *.ear
    echo target/
    echo .gradle/
    echo build/
    echo out/
    echo .settings/
    echo .classpath
    echo .project
    echo *.iml
    ) >> .gitignore
)

if /i "%type%"=="cpp" (
    (
    echo.
    echo # C/C++
    echo *.o
    echo *.obj
    echo *.exe
    echo *.dll
    echo *.so
    echo *.dylib
    echo *.lib
    echo *.a
    echo *.out
    echo build/
    echo cmake-build-*/
    echo CMakeFiles/
    echo CMakeCache.txt
    echo .vs/
    echo x64/
    echo Debug/
    echo Release/
    ) >> .gitignore
)

if /i "%type%"=="unity" (
    (
    echo.
    echo # Unity
    echo [Ll]ibrary/
    echo [Tt]emp/
    echo [Oo]bj/
    echo [Bb]uild/
    echo [Bb]uilds/
    echo [Ll]ogs/
    echo [Uu]ser[Ss]ettings/
    echo MemoryCaptures/
    echo .vs/
    echo *.csproj
    echo *.unityproj
    echo *.sln
    echo *.suo
    ) >> .gitignore
)

echo.
echo [OK] .gitignore 已生成 (类型: %type%)
echo.
echo 默认忽略列表:
echo ----------------------------------------
type .gitignore
echo ----------------------------------------
echo.
echo 你可以继续添加需要忽略的文件或目录
echo 每次输入一条, 输入 done 结束
echo.
echo 示例:
echo   data/          忽略 data 目录
echo   *.log          忽略所有 log 文件
echo   config.ini     忽略某个文件
echo.

:ADD_IGNORE_LOOP
set "ignore_item="
set /p "ignore_item=添加忽略规则 (done 结束): "

if /i "!ignore_item!"=="done" goto ADD_IGNORE_DONE
if "!ignore_item!"=="" goto ADD_IGNORE_LOOP

echo !ignore_item!>> .gitignore
echo   已添加: !ignore_item!

goto ADD_IGNORE_LOOP

:ADD_IGNORE_DONE
echo.
echo 最终 .gitignore 内容:
echo ----------------------------------------
type .gitignore
echo ----------------------------------------
echo.

goto :eof


:ERR
echo.
echo ========================================
echo   [错误] 操作失败
echo ----------------------------------------
echo   - 检查网络连接
echo   - 检查 GitHub 认证
echo   - 检查远程仓库是否存在
echo   - 检查是否有冲突
echo   - 检查用户配置
echo ========================================
echo.
pause
goto MAIN