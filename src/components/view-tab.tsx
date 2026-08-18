'use client'

import { exitView } from "@/app/actions/view-actions"
import { Button } from "./ui/button"
import { redirect } from "next/navigation"

export default function ViewTab({userName}:{userName:string}){

    const handleExitView = async ()=>{
        await exitView()
        redirect("/admin/users", "replace")
    }
    return(
        <div className="flex w-full p-1"  style={{ background: 'var(--rs-primary-500)' }}>
            <div className="flex items-center text-center w-full">
                <span className="w-full text-white">You are in Viewing Mode: {userName}</span>
            </div>
            <Button className="gap-2 bg-red-500 px-5 cursor-pointer" onClick={(()=>handleExitView())}>Exit</Button>
        </div>
    )
}