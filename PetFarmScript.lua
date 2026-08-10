--[[
    ========================================================================
    PET SIMULATOR X - DEMO EDUKACYJNA (DZIAŁAJĄCA WERSJA)
    ========================================================================
    To jest samodzielna demonstracja systemu automatyzacji.
    Symuluje:
    - Monety ze zdrowiem (Health)
    - Latające zwierzęta
    - Zbieranie monet
    - GUI z opcjami
    
    NIE wymaga uruchomionej gry PSX - działa samodzielnie.
]]

-- ========================================================================
-- SERWISY
-- ========================================================================
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local TweenService = game:GetService("TweenService")

local LocalPlayer = Players.LocalPlayer
local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")
local Character = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
local HumanoidRootPart = Character:WaitForChild("HumanoidRootPart")

-- ========================================================================
-- USTAWIENIA
-- ========================================================================
local Settings = {
    AutoFarm = false,
    AutoCollect = false,
    FarmSpeed = 0.3,
    MineAmount = 100,
    TeleportToCoin = true,
    ShowPets = true,
}

-- ========================================================================
-- SYMULACJA GRY - DEMO COINS I PETS
-- ========================================================================

-- Stwórz folder na monety (symulacja __THINGS.Coins)
local DemoFolder = Instance.new("Folder")
DemoFolder.Name = "DemoCoins"
DemoFolder.Parent = Workspace

-- Lista demonstracyjnych monet
local demoCoins = {}
local coinIDCounter = 1

-- Stwórz kilka monet wokół gracza
local function CreateDemoCoins()
    for i = 1, 8 do
        local angle = (i / 8) * math.pi * 2
        local distance = 15 + math.random() * 20
        local x = math.cos(angle) * distance
        local z = math.sin(angle) * distance
        
        local coin = Instance.new("Part")
        coin.Name = "DemoCoin_" .. coinIDCounter
        coinIDCounter += 1
        coin.Size = Vector3.new(3, 3, 3)
        coin.Position = HumanoidRootPart.Position + Vector3.new(x, 5, z)
        coin.BrickColor = BrickColor.new("Bright yellow")
        coin.Material = Enum.Material.Neon
        coin.Anchored = true
        coin.CanCollide = false
        coin.Parent = DemoFolder
        
        -- Health value (ile razy trzeba uderzyć)
        local health = Instance.new("IntValue")
        health.Name = "Health"
        health.Value = math.random(3, 8)
        health.Parent = coin
        
        -- Wartość monety
        local value = Instance.new("IntValue")
        value.Name = "Value"
        value.Value = math.random(10, 100)
        value.Parent = coin
        
        table.insert(demoCoins, coin)
        
        print(string.format("[Demo] Stworzono monetę: %s (Health: %d, Value: %d)", 
            coin.Name, health.Value, value.Value))
    end
end

-- Stwórz monety na start
CreateDemoCoins()
print(string.format("[Demo] Stworzono %d monet demonstracyjnych", #demoCoins))

-- ========================================================================
-- SYMULACJA ZWIERZĄT
-- ========================================================================

local petsFolder = Instance.new("Folder")
petsFolder.Name = "DemoPets"
petsFolder.Parent = Workspace

local demoPets = {}
local petIDCounter = 1

-- Stwórz zwierzęta gracza
local function CreateDemoPet(name, color)
    local pet = Instance.new("Part")
    pet.Name = name
    pet.Size = Vector3.new(1.5, 1.5, 1.5)
    pet.Position = HumanoidRootPart.Position + Vector3.new(
        math.random(-5, 5),
        3,
        math.random(-5, 5)
    )
    pet.BrickColor = BrickColor.new(color)
    pet.Material = Enum.Material.Neon
    pet.Anchored = true
    pet.CanCollide = false
    pet.Parent = petsFolder
    
    -- Światło na zwierzęciu
    local light = Instance.new("PointLight")
    light.Color = BrickColor.new(color).Color
    light.Range = 8
    light.Parent = pet
    
    table.insert(demoPets, pet)
    return pet
end

-- Stwórz 3 zwierzęta
CreateDemoPet("Pet1_Dog", "Bright red")
CreateDemoPet("Pet2_Cat", "Bright blue")
CreateDemoPet("Pet3_Bird", "Bright green")

print("[Demo] Stworzono " .. #demoPets .. " zwierząt demonstracyjnych")

-- ========================================================================
-- FUNKCJE POMOCNICZE
-- ========================================================================

local function GetDistanceTo(obj)
    if not obj then return math.huge end
    return (HumanoidRootPart.Position - obj.Position).Magnitude
end

-- Znajdź najbliższą monetę
local function GetNearestCoin()
    local closest = nil
    local shortestDist = 100
    
    for _, coin in ipairs(demoCoins) do
        if coin and coin.Parent then
            local health = coin:FindFirstChild("Health")
            if health and health.Value > 0 then
                local dist = GetDistanceTo(coin)
                if dist < shortestDist then
                    shortestDist = dist
                    closest = coin
                end
            end
        end
    end
    
    return closest
end

-- Znajdź wszystkie żywe monety
local function GetAllLiveCoins()
    local live = {}
    for _, coin in ipairs(demoCoins) do
        if coin and coin.Parent then
            local health = coin:FindFirstChild("Health")
            if health and health.Value > 0 then
                table.insert(live, coin)
            end
        end
    end
    return live
end

-- ========================================================================
-- ANIMACJA ZWIERZĄT LATĄCYCH DO MONET
-- ========================================================================

local flyingPets = {}
local activeTargets = {}

-- Zleć zwierzęciu lecenie do monety
local function SendPetToCoin(pet, coin)
    if not pet or not coin or not pet.Parent or not coin.Parent then return end
    if flyingPets[pet] then return end
    
    flyingPets[pet] = true
    
    local petStart = pet.Position
    local coinPos = coin.Position + Vector3.new(0, 3, 0)
    
    -- Animacja lotu (łuk)
    local tweenInfo = TweenInfo.new(1.5, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut)
    local tween = TweenService:Create(pet, tweenInfo, {
        Position = coinPos
    })
    
    tween:Play()
    
    tween.Completed:Connect(function()
        if pet and pet.Parent and coin and coin.Parent then
            -- Odegraj uderzenie
            local health = coin:FindFirstChild("Health")
            if health and health.Value > 0 then
                health.Value -= 1
                print(string.format("[Demo] %s uderzył %s! Health: %d", 
                    pet.Name, coin.Name, health.Value))
                
                -- Animacja uderzenia
                local originalSize = coin.Size
                local hitTween = TweenService:Create(coin, TweenInfo.new(0.1), {
                    Size = originalSize * 0.8
                })
                hitTween:Play()
                task.wait(0.1)
                coin.Size = originalSize
                
                -- Sprawdź czy zniszczone
                if health.Value <= 0 then
                    print(string.format("[Demo] %s ZNISZCZONY!", coin.Name))
                    
                    -- Animacja zniszczenia
                    local destroyTween = TweenService:Create(coin, TweenInfo.new(0.3), {
                        Size = Vector3.new(0, 0, 0),
                        Transparency = 1
                    })
                    destroyTween:Play()
                    task.wait(0.3)
                    coin:Destroy()
                    
                    -- Usuń z listy
                    for i, c in ipairs(demoCoins) do
                        if c == coin then
                            table.remove(demoCoins, i)
                            break
                        end
                    end
                end
            end
        end
        
        flyingPets[pet] = nil
        
        -- Jeśli auto farm włączony, leć do następnej monety
        if Settings.AutoFarm and pet and pet.Parent then
            task.wait(0.2)
            local nextCoin = GetNearestCoin()
            if nextCoin then
                SendPetToCoin(pet, nextCoin)
            end
        end
    end)
end

-- Rozślij wszystkie zwierzęta do najbliższej monety
local function SendAllPetsToNearestCoin()
    local target = GetNearestCoin()
    if not target then 
        print("[Demo] Brak celów!")
        return 
    end
    
    for _, pet in ipairs(demoPets) do
        if pet and pet.Parent then
            task.wait(0.2) -- Opóźnienie między startem każdego zwierzęcia
            SendPetToCoin(pet, target)
        end
    end
end

-- Rozślij zwierzęta do wszystkich monet
local function SendPetsToAllCoins()
    local coins = GetAllLiveCoins()
    if #coins == 0 then 
        print("[Demo] Brak monet!")
        return 
    end
    
    for i, coin in ipairs(coins) do
        if i <= #demoPets then
            local pet = demoPets[i]
            if pet and pet.Parent then
                task.wait(0.2)
                SendPetToCoin(pet, coin)
            end
        end
    end
end

-- Teleportuj gracza do monety
local function TeleportToCoin(coin)
    if not coin or not coin.Parent then return end
    if not Settings.TeleportToCoin then return end
    
    local targetPos = coin.Position + Vector3.new(0, 10, 0)
    local tweenInfo = TweenInfo.new(0.5, Enum.EasingStyle.Linear)
    local tween = TweenService:Create(HumanoidRootPart, tweenInfo, {
        CFrame = CFrame.new(targetPos)
    })
    tween:Play()
    print("[Demo] Teleportacja do: " .. coin.Name)
end

-- Zbierz monety leżące na ziemi (niska wartość)
local function CollectNearby()
    for _, coin in ipairs(demoCoins) do
        if coin and coin.Parent then
            local health = coin:FindFirstChild("Health")
            if health and health.Value <= 0 then
                local dist = GetDistanceTo(coin)
                if dist < 20 then
                    print("[Demo] Zbieranie: " .. coin.Name)
                    coin:Destroy()
                    for i, c in ipairs(demoCoins) do
                        if c == coin then
                            table.remove(demoCoins, i)
                            break
                        end
                    end
                end
            end
        end
    end
end

-- ========================================================================
-- GŁÓWNA PĘTLA
-- ========================================================================
task.spawn(function()
    task.wait(2)
    
    print("[Demo] ========================================")
    print("[Demo] System uruchomiony!")
    print("[Demo] Zwierzęta: " .. #demoPets)
    print("[Demo] Monety: " .. #demoCoins)
    print("[Demo] ========================================")
    print("[Demo] Włącz 'Auto Farm' w GUI, aby rozpocząć!")
    
    while true do
        task.wait(Settings.FarmSpeed)
        
        if Settings.AutoFarm then
            local target = GetNearestCoin()
            if target then
                TeleportToCoin(target)
                task.wait(0.3)
                SendAllPetsToNearestCoin()
            else
                -- Jeśli brak monet, stwórz nowe
                if #demoCoins < 3 then
                    print("[Demo] Brak monet - tworzenie nowych...")
                    CreateDemoCoins()
                end
            end
        end
        
        if Settings.AutoCollect then
            CollectNearby()
        end
    end
end)

-- ========================================================================
-- RESPAWN
-- ========================================================================
LocalPlayer.CharacterAdded:Connect(function(newChar)
    Character = newChar
    HumanoidRootPart = newChar:WaitForChild("HumanoidRootPart")
    print("[Demo] Postać respawniona")
end)

-- ========================================================================
-- STWORZ GUI
-- ========================================================================

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "PetFarmDemo"
ScreenGui.ResetOnSpawn = false
ScreenGui.Parent = PlayerGui
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

-- Panel
local MainFrame = Instance.new("Frame")
MainFrame.Name = "MainFrame"
MainFrame.Size = UDim2.new(0, 280, 0, 380)
MainFrame.Position = UDim2.new(0.5, -140, 0.5, -190)
MainFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
MainFrame.BorderSizePixel = 0
MainFrame.Active = true
MainFrame.Selectable = true
MainFrame.ZIndex = 100
MainFrame.Parent = ScreenGui

local Corner = Instance.new("UICorner")
Corner.CornerRadius = UDim.new(0, 16)
Corner.Parent = MainFrame

-- Pasek tytułu
local TitleBar = Instance.new("Frame")
TitleBar.Name = "TitleBar"
TitleBar.Size = UDim2.new(1, 0, 0, 48)
TitleBar.BackgroundColor3 = Color3.fromRGB(40, 40, 60)
TitleBar.BorderSizePixel = 0
TitleBar.Active = true
TitleBar.Selectable = true
TitleBar.ZIndex = 100
TitleBar.Parent = MainFrame

local TitleCorner = Instance.new("UICorner")
TitleCorner.CornerRadius = UDim.new(0, 16)
TitleCorner.Parent = TitleBar

-- Tytuł
local Title = Instance.new("TextLabel")
Title.Size = UDim2.new(1, -50, 1, 0)
Title.Position = UDim2.new(0, 18, 0, 0)
Title.BackgroundTransparency = 1
Title.Text = "Pet Simulator X - DEMO"
Title.TextColor3 = Color3.fromRGB(100, 180, 255)
Title.TextSize = 17
Title.Font = Enum.Font.GothamBold
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.ZIndex = 100
Title.Parent = TitleBar

-- Zamknij
local CloseBtn = Instance.new("TextButton")
CloseBtn.Size = UDim2.new(0, 38, 0, 38)
CloseBtn.Position = UDim2.new(1, -44, 0, 5)
CloseBtn.BackgroundColor3 = Color3.fromRGB(220, 60, 60)
CloseBtn.Text = "X"
CloseBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
CloseBtn.TextSize = 18
CloseBtn.Font = Enum.Font.GothamBold
CloseBtn.ZIndex = 100
CloseBtn.Parent = TitleBar

local CloseCorner = Instance.new("UICorner")
CloseCorner.CornerRadius = UDim.new(0, 10)
CloseCorner.Parent = CloseBtn

-- Zawartość
local Content = Instance.new("ScrollingFrame")
Content.Size = UDim2.new(1, 0, 1, -48)
Content.Position = UDim2.new(0, 0, 0, 48)
Content.BackgroundTransparency = 1
Content.ScrollBarThickness = 4
Content.ScrollBarImageColor3 = Color3.fromRGB(100, 150, 255)
Content.ZIndex = 100
Content.Parent = MainFrame

local Padding = Instance.new("UIPadding")
Padding.PaddingTop = UDim.new(0, 12)
Padding.PaddingBottom = UDim.new(0, 12)
Padding.PaddingLeft = UDim.new(0, 12)
Padding.PaddingRight = UDim.new(0, 12)
Padding.Parent = Content

local Layout = Instance.new("UIListLayout")
Layout.Padding = UDim.new(0, 10)
Layout.SortOrder = Enum.SortOrder.LayoutOrder
Layout.Parent = Content

-- Funkcje GUI
local function CreateToggle(text, default, callback)
    local Button = Instance.new("TextButton")
    Button.Size = UDim2.new(1, 0, 0, 45)
    Button.BackgroundColor3 = default and Color3.fromRGB(60, 180, 100) or Color3.fromRGB(50, 50, 70)
    Button.Text = (default and "● " or "○ ") .. text
    Button.TextColor3 = Color3.fromRGB(255, 255, 255)
    Button.TextSize = 13
    Button.Font = Enum.Font.GothamBold
    Button.TextXAlignment = Enum.TextXAlignment.Left
    Button.ZIndex = 100
    Button.Parent = Content
    
    local Corner = Instance.new("UICorner")
    Corner.CornerRadius = UDim.new(0, 10)
    Corner.Parent = Button
    
    local Pad = Instance.new("UIPadding")
    Pad.PaddingLeft = UDim.new(0, 16)
    Pad.Parent = Button
    
    Button.MouseButton1Click:Connect(function()
        default = not default
        Button.Text = (default and "● " or "○ ") .. text
        Button.BackgroundColor3 = default and Color3.fromRGB(60, 180, 100) or Color3.fromRGB(50, 50, 70)
        callback(default)
    end)
    
    return Button
end

local function CreateInfo(text)
    local Label = Instance.new("TextLabel")
    Label.Size = UDim2.new(1, 0, 0, 50)
    Label.BackgroundColor3 = Color3.fromRGB(35, 35, 50)
    Label.Text = text
    Label.TextColor3 = Color3.fromRGB(200, 200, 220)
    Label.TextSize = 12
    Label.Font = Enum.Font.Gotham
    Label.TextWrapped = true
    Label.ZIndex = 100
    Label.Parent = Content
    
    local Corner = Instance.new("UICorner")
    Corner.CornerRadius = UDim.new(0, 10)
    Corner.Parent = Label
    
    return Label
end

-- Sekcje
local title1 = Instance.new("TextLabel")
title1.Size = UDim2.new(1, 0, 0, 25)
title1.BackgroundTransparency = 1
title1.Text = "Auto Farm"
title1.TextColor3 = Color3.fromRGB(100, 180, 255)
title1.TextSize = 14
title1.Font = Enum.Font.GothamBold
title1.TextXAlignment = Enum.TextXAlignment.Left
title1.ZIndex = 100
title1.Parent = Content

CreateToggle("Auto Farm", Settings.AutoFarm, function(val)
    Settings.AutoFarm = val
    if val then
        print("[Demo] Auto Farm WŁĄCZONY")
    else
        print("[Demo] Auto Farm WYŁĄCZONY")
    end
end)

CreateToggle("Auto Collect", Settings.AutoCollect, function(val)
    Settings.AutoCollect = val
end)

CreateToggle("Teleport do monet", Settings.TeleportToCoin, function(val)
    Settings.TeleportToCoin = val
end)

local spacer = Instance.new("Frame")
spacer.Size = UDim2.new(1, 0, 0, 8)
spacer.BackgroundTransparency = 1
spacer.ZIndex = 100
spacer.Parent = Content

local title2 = Instance.new("TextLabel")
title2.Size = UDim2.new(1, 0, 0, 25)
title2.BackgroundTransparency = 1
title2.Text = "Status"
title2.TextColor3 = Color3.fromRGB(100, 180, 255)
title2.TextSize = 14
title2.Font = Enum.Font.GothamBold
title2.TextXAlignment = Enum.TextXAlignment.Left
title2.ZIndex = 100
title2.Parent = Content

local InfoLabel = CreateInfo("Zwierzęta: 0 | Monety: 0")

-- Aktualizuj info
task.spawn(function()
    while true do
        task.wait(1)
        if InfoLabel and InfoLabel.Parent then
            local liveCoins = GetAllLiveCoins()
            InfoLabel.Text = string.format("Zwierzęta: %d | Żywe monety: %d", #demoPets, #liveCoins)
        end
    end
end)

-- ========================================================================
-- PRZECIĄGANIE
-- ========================================================================
local dragging, dragInput, dragStart, startPos

TitleBar.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 then
        dragging = true
        dragStart = input.Position
        startPos = MainFrame.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then
                dragging = false
            end
        end)
    end
end)

TitleBar.InputChanged:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseMovement then
        dragInput = input
    end
end)

UserInputService.InputChanged:Connect(function(input)
    if input == dragInput and dragging then
        local delta = input.Position - dragStart
        MainFrame.Position = UDim2.new(
            startPos.X.Scale,
            startPos.X.Offset + delta.X,
            startPos.Y.Scale,
            startPos.Y.Offset + delta.Y
        )
    end
end)

-- Zamknij
CloseBtn.MouseButton1Click:Connect(function()
    MainFrame.Visible = not MainFrame.Visible
end)

-- ========================================================================
-- INSTRUKCJE
-- ========================================================================
print("========================================")
print("PET SIMULATOR X - DEMO EDUKACYJNA")
print("========================================")
print("DEMO tworzy własne monety i zwierzęta")
print("w Workspace - nie wymaga uruchomionej gry!")
print("")
print("Sterowanie:")
print("- Auto Farm: zwierzęta lecą do monet")
print("- Teleport: teleportuje cię do monety")
print("- Auto Collect: zbiera zniszczone monety")
print("")
print("Zwierzęta mają kolory:")
print("- Czerwony = Dog")
print("- Niebieski = Cat")
print("- Zielony = Bird")
print("")
print("Monety są ŻÓŁTE i mają Health")
print("========================================")
